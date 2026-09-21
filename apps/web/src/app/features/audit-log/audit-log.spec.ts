import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import { AuditLog } from './audit-log.js';

function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'e1',
    projectId: 'p1',
    actorId: 'a1',
    entityType: 'Task',
    entityId: 't1',
    operation: 'UPDATE',
    previousValue: { title: 'Old title' },
    newValue: { title: 'New title' },
    origin: 'UI',
    occurredAt: '2026-09-15T10:00:00.000Z',
    actor: { id: 'a1', displayName: 'Ana García', kind: 'HUMAN' },
    ...overrides,
  };
}

describe('AuditLog', () => {
  let listForProject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listForProject = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'audit', component: AuditLog }] },
        ]),
        { provide: AuditService, useValue: { listForProject } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/audit', AuditLog);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, component, text: () => harness.routeNativeElement!.textContent ?? '' };
  }

  it('renders each event with its actor, origin, operation and field changes', async () => {
    listForProject.mockResolvedValue([
      auditEvent(),
      auditEvent({
        id: 'e2',
        entityType: 'SyncRun',
        operation: 'SYNC_RUN',
        origin: 'SYNC',
        actor: null,
        previousValue: null,
        newValue: { trigger: 'MANUAL' },
      }),
    ]);

    const { text } = await render();

    expect(listForProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ limit: 50, cursor: undefined }),
    );
    expect(text()).toContain('Ana García (Humano)');
    expect(text()).toContain('Título: Old title → New title');
    expect(text()).toContain('Sincronización');
    expect(text()).toContain('Disparador: — → MANUAL');
    expect(text()).not.toContain('Cargar más antiguos');
  });

  it('shows an empty state when nothing matches', async () => {
    listForProject.mockResolvedValue([]);
    const { text } = await render();
    expect(text()).toContain('Ningún cambio registrado coincide con estos filtros.');
  });

  it('pages backwards from the last event shown, and starts over when a filter changes', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => auditEvent({ id: `e${i}` }));
    listForProject
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([auditEvent({ id: 'older' })])
      .mockResolvedValueOnce([]);

    const { component, text } = await render();
    expect(text()).toContain('Cargar más antiguos');

    await component.loadOlder();
    expect(listForProject).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ cursor: 'e49' }),
    );
    expect(component.events()).toHaveLength(51);
    expect(component.hasMore()).toBe(false);

    component.originFilter.set('SYNC');
    await component.onFilterChange();
    expect(listForProject).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ origin: 'SYNC', cursor: undefined }),
    );
    expect(component.events()).toHaveLength(0);
  });
});
