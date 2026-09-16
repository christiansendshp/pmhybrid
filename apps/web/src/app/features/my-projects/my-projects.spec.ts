import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWithSummary, ProjectsService } from '../../core/projects.service.js';
import { MyProjects } from './my-projects.js';

function project(overrides: Partial<ProjectWithSummary> = {}): ProjectWithSummary {
  return {
    id: 'p1',
    name: 'Website Relaunch',
    description: 'New marketing site',
    repoUrl: null,
    docsPath: './site-docs',
    syncIntervalMinutes: 5,
    progressRollupStrategy: 'EQUAL_WEIGHT_AVERAGE',
    status: 'ACTIVE',
    createdAt: '2026-09-01T09:00:00.000Z',
    summary: {
      progress: 45.4,
      activeTasks: 3,
      overdueTasks: 1,
      activeAgents: 2,
      openConflicts: 0,
      lastSyncRun: {
        status: 'SUCCESS',
        startedAt: '2026-09-15T10:00:00.000Z',
        finishedAt: '2026-09-15T10:00:02.000Z',
      },
    },
    ...overrides,
  };
}

describe('MyProjects (brief §19)', () => {
  let listMine: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listMine = vi.fn();
    dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProjectsService, useValue: { listMine, create: vi.fn() } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(MyProjects);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { root, text: () => (root.textContent ?? '').replace(/\s+/g, ' ') };
  }

  it('shows each project with its status, progress, active and overdue tasks, agents, conflicts and last sync', async () => {
    listMine.mockResolvedValue([project()]);

    const { root } = await render();
    const cells = Array.from(root.querySelectorAll('tbody tr:first-child td')).map((cell) =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

    expect(cells[0]).toContain('Website Relaunch');
    expect(cells.slice(1, 7)).toEqual(['Activo', '45%', '3', '1', '2', '0']);
    expect(cells[7]).toContain('SUCCESS');
    expect(root.querySelector('a.projects__name')?.getAttribute('href')).toBe('/projects/p1');
    expect(root.querySelectorAll('td.alert')).toHaveLength(1);
  });

  it('says when a project has no tasks or has never synced', async () => {
    listMine.mockResolvedValue([
      project({
        status: 'PAUSED',
        summary: { ...project().summary, progress: null, lastSyncRun: null },
      }),
    ]);

    const { text } = await render();

    expect(text()).toContain('Pausado');
    expect(text()).toContain('Sin tareas');
    expect(text()).toContain('Nunca');
  });

  it('explains the empty state', async () => {
    listMine.mockResolvedValue([]);

    const { text } = await render();

    expect(text()).toContain('Todavía no eres miembro de ningún proyecto.');
  });

  it('fills docsPath from the folder browser dialog (Roadmap GAP-27)', async () => {
    listMine.mockResolvedValue([]);
    dialogOpen.mockReturnValue({ afterClosed: () => of('C:\\Users\\me\\my-project-docs') });
    const fixture = TestBed.createComponent(MyProjects);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.openCreateForm();
    component.browseDocsPath();

    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(component.form.controls.docsPath.value).toBe('C:\\Users\\me\\my-project-docs');
    expect(component.form.controls.docsPath.dirty).toBe(true);
  });

  it('leaves docsPath untouched when the folder browser dialog is cancelled', async () => {
    listMine.mockResolvedValue([]);
    dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) });
    const fixture = TestBed.createComponent(MyProjects);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.openCreateForm();
    component.form.controls.docsPath.setValue('./kept-as-is');
    component.browseDocsPath();

    expect(component.form.controls.docsPath.value).toBe('./kept-as-is');
  });
});
