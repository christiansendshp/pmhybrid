import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectContext } from '../../core/project-context.js';
import { Conflict, SynchronizationService } from '../../core/synchronization.service.js';
import { Conflicts } from './conflicts.js';

function conflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: 'c1',
    projectId: 'p1',
    kind: 'CONCURRENT_FIELD_EDIT',
    entityType: 'Task',
    entityId: 't1',
    localVersion: { title: 'Local title', status: 'EN_DESARROLLO' },
    externalVersion: { title: 'External title', status: 'QA' },
    detectedAt: '2026-09-15T09:00:00.000Z',
    resolvedAt: null,
    resolvedByActorId: null,
    resolutionStrategy: null,
    ...overrides,
  };
}

/** Its only contested field, externalId, is not in the manual-edit whitelist — no editable field. */
const disappearedRow = conflict({
  id: 'c2',
  kind: 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
  localVersion: { externalId: 'PMH-5' },
  externalVersion: null,
});

describe('Conflicts (brief §26 — resolution UI)', () => {
  let listConflicts: ReturnType<typeof vi.fn>;
  let resolveConflict: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listConflicts = vi.fn();
    resolveConflict = vi
      .fn()
      .mockResolvedValue(conflict({ resolvedAt: '2026-09-15T10:00:00.000Z' }));
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'conflicts', component: Conflicts }] },
        ]),
        { provide: SynchronizationService, useValue: { listConflicts, resolveConflict } },
      ],
    });
  });

  async function render(conflicts: Conflict[], permissions: string[] = ['conflict.resolve']) {
    TestBed.inject(ProjectContext).permissions.set(permissions);
    listConflicts.mockResolvedValue(conflicts);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/conflicts', Conflicts);
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const text = () => (harness.routeNativeElement!.textContent ?? '').replace(/\s+/g, ' ');
    const buttons = () =>
      Array.from(
        harness.routeNativeElement!.querySelectorAll('button') as NodeListOf<HTMLElement>,
      ).map((b) => b.textContent?.trim());
    return { harness, component, text, buttons };
  }

  it('shows a field-by-field diff with the local vs. external values and an explanation', async () => {
    const { text } = await render([conflict()]);

    expect(text()).toContain('CONCURRENT_FIELD_EDIT');
    expect(text()).toContain('cambiaron el mismo campo');
    expect(text()).toContain('Resultado (título)');
    expect(text()).toContain('Local title');
    expect(text()).toContain('External title');
  });

  it('defaults to open conflicts and switches to resolved via the filter toggle', async () => {
    const { component } = await render([conflict()]);
    expect(listConflicts).toHaveBeenCalledWith('p1', false);

    await component.setFilter(true);
    expect(listConflicts).toHaveBeenCalledWith('p1', true);
  });

  it('offers "Edit manually" only when a contested field is actually editable', async () => {
    const { buttons: buttonsFor } = await render([conflict(), disappearedRow]);
    const labels = buttonsFor();

    // One conflict has editable fields (title/status), the disappeared-row one doesn't (externalId isn't editable).
    expect(labels.filter((l) => l === 'Editar manualmente')).toHaveLength(1);
    // ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG still offers "keep document version" despite a null externalVersion.
    expect(labels).toContain('Conservar versión del documento');
  });

  it('explains an unrecognized status and offers a status choice, never "keep the document version" (Roadmap GAP-35b)', async () => {
    const unrecognized = conflict({
      id: 'c3',
      kind: 'UNRECOGNIZED_STATUS',
      localVersion: { status: 'PENDIENTE' },
      externalVersion: { statusRaw: 'WIP' },
    });
    const { text, buttons } = await render([unrecognized]);

    expect(text()).toContain('no reconoce');
    expect(text()).toContain('WIP');
    const labels = buttons();
    expect(labels).not.toContain('Conservar versión del documento');
    expect(labels).toContain('Editar manualmente');
    expect(labels).toContain('Descartar');
  });

  it('resolves KEEP_LOCAL and reloads the list', async () => {
    const { component } = await render([conflict()]);

    await component.resolve(conflict(), 'KEEP_LOCAL');
    expect(resolveConflict).toHaveBeenCalledWith('p1', 'c1', 'KEEP_LOCAL', undefined);
    expect(listConflicts).toHaveBeenCalledTimes(2);
  });

  it('prefills a manual edit from the local version and submits only editable, contested fields', async () => {
    const { component } = await render([conflict()]);

    component.startManualEdit(conflict());
    expect(component.manualFields().map((f) => f.field)).toEqual(['status', 'title']);
    expect(component.manualValues()).toEqual({ status: 'EN_DESARROLLO', title: 'Local title' });

    component.setManualValue('title', 'Edited title');
    await component.submitManualEdit(conflict());

    expect(resolveConflict).toHaveBeenCalledWith('p1', 'c1', 'MANUAL_EDIT', {
      status: 'EN_DESARROLLO',
      title: 'Edited title',
    });
    expect(component.editingConflictId()).toBeNull();
  });

  it('cancelManualEdit discards the in-progress edit without resolving', async () => {
    const { component } = await render([conflict()]);

    component.startManualEdit(conflict());
    component.cancelManualEdit();

    expect(component.editingConflictId()).toBeNull();
    expect(resolveConflict).not.toHaveBeenCalled();
  });

  it('surfaces a failed resolution as an alert instead of silently clearing the conflict', async () => {
    resolveConflict.mockRejectedValueOnce(new Error('boom'));
    const { harness, component, text } = await render([conflict()]);

    await component.resolve(conflict(), 'DISMISSED');
    harness.detectChanges();

    expect(text()).toContain('No se pudo resolver el conflicto.');
    expect(component.resolvingId()).toBeNull();
  });

  it('shows nothing to resolve once a conflict is resolved', async () => {
    const resolved = conflict({
      resolvedAt: '2026-09-15T10:00:00.000Z',
      resolutionStrategy: 'KEEP_LOCAL',
    });
    const { text, buttons } = await render([resolved]);

    expect(text()).toContain('resuelto');
    expect(buttons()).not.toContain('Conservar versión de la app');
    expect(buttons()).not.toContain('Descartar');
  });

  it('shows no resolution controls, and says why, without conflict.resolve (Roadmap SECURITY-02)', async () => {
    const { text, buttons } = await render([conflict()], []);

    expect(text()).toContain('Solo quien tenga permiso para resolver conflictos');
    expect(buttons()).not.toContain('Conservar versión de la app');
    expect(buttons()).not.toContain('Descartar');
  });
});
