import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardActivity,
  DashboardService,
  DashboardSummary,
} from '../../core/dashboard.service.js';
import { Dashboard } from './dashboard.js';

const SUMMARY: DashboardSummary = {
  activeProjects: 3,
  totalTasks: 24,
  pendiente: 5,
  asignada: 4,
  enDesarrollo: 8,
  qa: 3,
  terminada: 3,
  blocked: 1,
  globalProgress: 62,
};

const EMPTY_ACTIVITY: DashboardActivity = {
  recentlyModifiedTasks: [],
  recentStatusChanges: [],
  recentAssignments: [],
  recentAgentEvents: [],
  recentDocumentChanges: [],
};

const ACTIVITY: DashboardActivity = {
  ...EMPTY_ACTIVITY,
  recentlyModifiedTasks: [
    {
      id: 't1',
      projectId: 'p1',
      externalId: 'PMH-1',
      title: 'Build API',
      status: 'EN_DESARROLLO',
      updatedAt: '2026-09-15T10:00:00Z',
    },
  ],
  recentStatusChanges: [
    {
      id: 'c1',
      entityId: 't1',
      task: { id: 't1', projectId: 'p1', externalId: 'PMH-1', title: 'Build API' },
      previousValue: { status: 'PENDIENTE' },
      newValue: { status: 'ASIGNADA' },
      occurredAt: '2026-09-15T10:30:00Z',
    },
  ],
  recentAgentEvents: [
    {
      id: 'e1',
      projectId: 'p1',
      taskId: 't1',
      agentName: 'Codex',
      taskExternalId: 'F01-S01-T01',
      statusWord: 'DONE',
      summary: 'Finished the API client',
      createdAt: '2026-09-15T11:00:00Z',
    },
  ],
};

describe('Dashboard (brief §14)', () => {
  let getSummary: ReturnType<typeof vi.fn>;
  let getActivity: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSummary = vi.fn().mockResolvedValue(SUMMARY);
    getActivity = vi.fn().mockResolvedValue(EMPTY_ACTIVITY);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: { getSummary, getActivity } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();
    // ngOnInit awaits a plain Promise.all(), which whenStable() does not track.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    return { fixture, root, text };
  }

  it('shows the cross-project figures and the status breakdown', async () => {
    const { root, text } = await render();

    const figures = Array.from(root.querySelectorAll('.figure')).map((figure) => ({
      value: figure.querySelector('.figure__value')?.textContent?.trim(),
      label: figure.querySelector('.figure__label')?.textContent?.trim(),
    }));
    expect(figures).toEqual([
      { value: '3', label: 'proyectos activos' },
      { value: '24', label: 'tareas totales' },
      { value: '62%', label: 'avance global' },
    ]);
    expect(text()).toContain('5 Pendiente');
    expect(text()).toContain('1 bloqueada');
  });

  it('does not show a blocked count when nothing is blocked', async () => {
    getSummary.mockResolvedValue({ ...SUMMARY, blocked: 0 });
    const { text } = await render();

    expect(text()).not.toContain('bloqueada');
  });

  it('lists recent activity per group', async () => {
    getActivity.mockResolvedValue(ACTIVITY);
    const { text } = await render();

    expect(text()).toContain('Build API');
    expect(text()).toContain('EN DESARROLLO');
    expect(text()).toContain('Codex');
    expect(text()).toContain('F01-S01-T01');
    expect(text()).toContain('Finished the API client');
  });

  it('links every task-shaped item to its task, and a status change names which task it is about (Roadmap UX-03c2)', async () => {
    getActivity.mockResolvedValue({
      ...ACTIVITY,
      recentAssignments: [
        {
          id: 'a1',
          assignedAt: '2026-09-15T10:45:00Z',
          task: { id: 't2', projectId: 'p2', externalId: null, title: 'Write docs' },
          actor: { displayName: 'Ana' },
        },
      ],
      recentDocumentChanges: [
        {
          id: 'd1',
          capturedAt: '2026-09-15T12:00:00Z',
          source: 'SYNC',
          document: { kind: 'ROADMAP', projectId: 'p1' },
        },
      ],
    });
    const { root } = await render();
    const links = Array.from(root.querySelectorAll('a')).map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);

    expect(links).toEqual(
      expect.arrayContaining([
        ['Build API', '/projects/p1/tasks/t1'],
        ['Write docs', '/projects/p2/tasks/t2'],
        ['F01-S01-T01', '/projects/p1/tasks/t1'],
        ['Roadmap', '/projects/p1/documents'],
      ]),
    );
    // The status change says which task it is, then what changed.
    const change = root.querySelectorAll('.activity__group')[1];
    expect(change.textContent).toContain('Build API');
    expect(change.textContent).toContain('PENDIENTE → ASIGNADA');
  });

  it('names an empty activity group instead of leaving it blank', async () => {
    const { text } = await render();

    expect(text()).toContain('Sin cambios recientes.');
  });

  it('shows a loading state before the data arrives', () => {
    let resolveSummary!: (value: DashboardSummary) => void;
    getSummary.mockReturnValue(new Promise((resolve) => (resolveSummary = resolve)));
    const fixture = TestBed.createComponent(Dashboard);

    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cargando el panel');
    resolveSummary(SUMMARY);
  });

  it('reports a failed load instead of rendering an empty panel silently', async () => {
    getSummary.mockRejectedValue(
      new HttpErrorResponse({ error: { message: 'boom' }, status: 500 }),
    );
    const { text } = await render();

    expect(text()).toContain('boom');
  });
});
