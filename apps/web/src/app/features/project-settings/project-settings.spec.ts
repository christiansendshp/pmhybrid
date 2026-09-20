import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectContext } from '../../core/project-context.js';
import { Project, ProjectsService } from '../../core/projects.service.js';
import { ProjectSettings } from './project-settings.js';

const PROJECT: Project = {
  id: 'p1',
  name: 'Website Relaunch',
  description: 'New marketing site',
  repoUrl: 'https://example.test/site',
  docsPath: './site-docs',
  syncIntervalMinutes: 5,
  progressRollupStrategy: 'EQUAL_WEIGHT_AVERAGE',
  status: 'ACTIVE',
  createdAt: '2026-09-01T09:00:00.000Z',
  lead: null,
};

describe('ProjectSettings', () => {
  let update: ReturnType<typeof vi.fn>;
  let listMembers: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    update = vi.fn();
    listMembers = vi.fn().mockResolvedValue([]);
    dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        { provide: ProjectsService, useValue: { update, listMembers } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    });
  });

  function render(permissions: string[]) {
    const context = TestBed.inject(ProjectContext);
    context.project.set(PROJECT);
    context.permissions.set(permissions);
    const fixture = TestBed.createComponent(ProjectSettings);
    fixture.detectChanges();
    const text = () =>
      ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    return { fixture, component: fixture.componentInstance, context, text };
  }

  it('shows the project settings, read-only without project.update', () => {
    const { component, text } = render([]);

    expect(component.form.getRawValue()).toMatchObject({
      name: 'Website Relaunch',
      status: 'ACTIVE',
      syncIntervalMinutes: 5,
      docsPath: './site-docs',
      progressRollupStrategy: 'EQUAL_WEIGHT_AVERAGE',
    });
    expect(component.form.disabled).toBe(true);
    expect(text()).toContain('para cambiarla necesitas el permiso project.update');
    expect(text()).not.toContain('Guardar configuración');
  });

  it('saves trimmed settings, clears emptied optional fields and updates the project header', async () => {
    const { fixture, component, context, text } = render(['project.update']);
    update.mockResolvedValue({ ...PROJECT, name: 'Site 2.0', status: 'PAUSED', description: null });

    component.form.patchValue({ name: '  Site 2.0 ', status: 'PAUSED', description: '  ' });
    component.form.markAsDirty();
    await component.save();
    fixture.detectChanges();

    expect(update).toHaveBeenCalledWith('p1', {
      name: 'Site 2.0',
      description: null,
      status: 'PAUSED',
      syncIntervalMinutes: 5,
      docsPath: './site-docs',
      repoUrl: 'https://example.test/site',
      progressRollupStrategy: 'EQUAL_WEIGHT_AVERAGE',
      leadActorId: null,
    });
    expect(context.project()?.name).toBe('Site 2.0');
    expect(component.form.pristine).toBe(true);
    expect(text()).toContain('Configuración guardada.');
  });

  it('offers project members (human and AI agent) as lead candidates and saves the choice (Roadmap GAP-32)', async () => {
    listMembers.mockResolvedValue([
      { actorId: 'a1', actor: { id: 'a1', displayName: 'Jane', kind: 'HUMAN' } },
      { actorId: 'a2', actor: { id: 'a2', displayName: 'ClaudeBot', kind: 'AI_AGENT' } },
    ]);
    const { component, context, fixture } = render(['project.update']);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listMembers).toHaveBeenCalledWith('p1');
    expect(component.members()).toEqual([
      { actorId: 'a1', actor: { id: 'a1', displayName: 'Jane', kind: 'HUMAN' } },
      { actorId: 'a2', actor: { id: 'a2', displayName: 'ClaudeBot', kind: 'AI_AGENT' } },
    ]);

    update.mockResolvedValue({
      ...PROJECT,
      lead: { id: 'a2', displayName: 'ClaudeBot', kind: 'AI_AGENT' },
    });
    component.form.patchValue({ leadActorId: 'a2' });
    component.form.markAsDirty();
    await component.save();

    expect(update).toHaveBeenCalledWith('p1', expect.objectContaining({ leadActorId: 'a2' }));
    expect(context.project()?.lead).toMatchObject({ id: 'a2', kind: 'AI_AGENT' });
  });

  it('changes the progress rollup strategy and saves it (Roadmap GAP-21)', async () => {
    const { component, context } = render(['project.update']);
    update.mockResolvedValue({ ...PROJECT, progressRollupStrategy: 'LEAF_EQUAL_WEIGHT' });

    component.form.patchValue({ progressRollupStrategy: 'LEAF_EQUAL_WEIGHT' });
    component.form.markAsDirty();
    await component.save();

    expect(update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ progressRollupStrategy: 'LEAF_EQUAL_WEIGHT' }),
    );
    expect(context.project()?.progressRollupStrategy).toBe('LEAF_EQUAL_WEIGHT');
  });

  it('refuses invalid settings and shows why a save failed', async () => {
    const { fixture, component, text } = render(['project.update']);

    component.form.patchValue({ docsPath: ' ', syncIntervalMinutes: 0 });
    await component.save();
    expect(update).not.toHaveBeenCalled();

    update.mockRejectedValue(
      new HttpErrorResponse({ status: 403, error: { message: 'Forbidden' } }),
    );
    component.form.patchValue({ docsPath: './site-docs', syncIntervalMinutes: 10 });
    component.form.markAsDirty();
    await component.save();
    fixture.detectChanges();

    expect(component.errorMessage()).toBeTruthy();
    expect(text()).not.toContain('Configuración guardada.');
  });

  it('offers "Explorar…" only when editable, and it fills docsPath from the dialog (Roadmap GAP-27)', () => {
    dialogOpen.mockReturnValue({ afterClosed: () => of('C:\\repos\\site-docs') });
    const { component, text } = render(['project.update']);

    expect(text()).toContain('Explorar…');
    component.browseDocsPath();

    expect(dialogOpen).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { initialPath: './site-docs' } }),
    );
    expect(component.form.controls.docsPath.value).toBe('C:\\repos\\site-docs');
    expect(component.form.controls.docsPath.dirty).toBe(true);
  });

  it('hides "Explorar…" without project.update', () => {
    const { text } = render([]);

    expect(text()).not.toContain('Explorar…');
  });
});
