import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
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
};

describe('ProjectSettings', () => {
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    update = vi.fn();
    TestBed.configureTestingModule({
      providers: [ProjectContext, { provide: ProjectsService, useValue: { update } }],
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
    });
    expect(component.form.disabled).toBe(true);
    expect(text()).toContain('para cambiarla necesitas el permiso project.update');
    expect(text()).toContain('Promedio de peso igual');
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
    });
    expect(context.project()?.name).toBe('Site 2.0');
    expect(component.form.pristine).toBe(true);
    expect(text()).toContain('Configuración guardada.');
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
});
