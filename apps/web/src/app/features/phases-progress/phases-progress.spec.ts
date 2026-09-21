import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectProgressTree, TasksService } from '../../core/tasks.service.js';
import { PhasesProgress } from './phases-progress.js';

function counts(
  overrides: Partial<Record<string, number>> = {},
): ProjectProgressTree['statusCounts'] {
  return {
    PENDIENTE: 0,
    ASIGNADA: 0,
    EN_DESARROLLO: 0,
    QA: 0,
    TERMINADA: 0,
    ...overrides,
  };
}

const TREE: ProjectProgressTree = {
  project: 62,
  statusCounts: counts({ EN_DESARROLLO: 2, TERMINADA: 1 }),
  phases: [
    {
      kind: 'PHASE',
      id: 'ph1',
      name: 'Build',
      progress: 50,
      statusCounts: counts({ EN_DESARROLLO: 1 }),
      epics: [],
      tasks: [
        {
          kind: 'TASK',
          id: 't1',
          name: 'Build API',
          status: 'EN_DESARROLLO',
          progress: 50,
          statusCounts: counts({ EN_DESARROLLO: 1 }),
          subtasks: [],
        },
      ],
    },
  ],
  epics: [],
  tasks: [],
};

describe('PhasesProgress (brief §16)', () => {
  let getProjectProgress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getProjectProgress = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [{ path: 'progress', component: PhasesProgress }],
          },
        ]),
        { provide: TasksService, useValue: { getProjectProgress } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/p1/progress', PhasesProgress);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    return { harness, text: () => harness.routeNativeElement!.textContent ?? '' };
  }

  it('shows a loading state before the tree arrives', async () => {
    getProjectProgress.mockReturnValue(new Promise(() => {}));
    const { text } = await render();

    expect(text()).toContain('Cargando');
  });

  it('renders project, phase and task progress in Spanish, with a display-only status separator', async () => {
    getProjectProgress.mockResolvedValue(TREE);
    const { text } = await render();

    expect(getProjectProgress).toHaveBeenCalledWith('p1');
    expect(text()).toContain('Progreso del proyecto');
    expect(text()).toContain('62 %');
    expect(text()).toContain('Build');
    expect(text()).toContain('50 %');
    expect(text()).toContain('1 EN DESARROLLO');
    expect(text()).toContain('Build API');
  });

  it('shows "sin datos" instead of a raw null when nothing has a progress figure yet', async () => {
    getProjectProgress.mockResolvedValue({ ...TREE, project: null });
    const { text } = await render();

    expect(text()).toContain('sin datos');
  });

  it('draws a bar for the project, each phase and each task, named after what it measures', async () => {
    getProjectProgress.mockResolvedValue({ ...TREE, project: 61.53846153846154 });
    const { harness } = await render();
    const bars = Array.from(harness.routeNativeElement!.querySelectorAll('[role="progressbar"]'));

    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'Progreso del proyecto',
      'Progreso de Build',
      'Progreso de Build API',
    ]);
    // Whole numbers, never 61.53846153846154.
    expect(bars[0].getAttribute('aria-valuenow')).toBe('62');
    expect(harness.routeNativeElement!.textContent).not.toContain('61.5');
  });
});
