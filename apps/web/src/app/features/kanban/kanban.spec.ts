import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyService, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { ProjectContext } from '../../core/project-context.js';
import { ProjectsService } from '../../core/projects.service.js';
import { TaskCard, TasksService } from '../../core/tasks.service.js';
import { BoardMemory } from '../../core/board-query.js';
import { Viewport } from '../../core/viewport.js';
import { COLUMN_CAP, Kanban } from './kanban.js';

function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 't1',
    projectId: 'p1',
    externalId: 'PMH-1',
    title: 'Build API',
    description: null,
    status: 'ASIGNADA',
    phaseId: 'ph1',
    epicId: 'ep1',
    templateId: null,
    parentTaskId: null,
    assigneeActorId: 'codex',
    priority: 'HIGH',
    entryType: null,
    progressPercent: null,
    acceptanceCriteria: 'Endpoints documented',
    startDate: null,
    estimatedDate: null,
    dueDate: '2099-10-10T00:00:00.000Z',
    completedAt: null,
    roadmapTable: 'BLOCKED',
    blockedReason: 'Waiting on credentials',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    assignee: { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT' },
    computedProgress: 45,
    subtaskCounts: { total: 2, done: 1 },
    dependencyCounts: { total: 1, open: 1 },
    ...overrides,
  };
}

const HIERARCHY: ProjectHierarchy = {
  phases: [
    { id: 'ph1', projectId: 'p1', name: 'Build', order: 1, description: null, status: null },
  ],
  epics: [
    {
      id: 'ep1',
      projectId: 'p1',
      phaseId: 'ph1',
      name: 'Public API',
      order: 1,
      description: null,
      status: null,
    },
  ],
  templates: [],
};

describe('Kanban (brief §15)', () => {
  let listForProject: ReturnType<typeof vi.fn>;
  let transition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listForProject = vi.fn();
    transition = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'kanban', component: Kanban }] },
        ]),
        { provide: TasksService, useValue: { listForProject, transition } },
        { provide: ProjectsService, useValue: { listMembers: vi.fn().mockResolvedValue([]) } },
        { provide: HierarchyService, useValue: { load: vi.fn().mockResolvedValue(HIERARCHY) } },
      ],
    });
  });

  async function render(
    cards: TaskCard[],
    permissions: string[] = ['task.write'],
    url = '/projects/p1/kanban',
  ) {
    TestBed.inject(ProjectContext).permissions.set(permissions);
    listForProject.mockResolvedValue(cards);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(url, Kanban);
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const text = () => (harness.routeNativeElement!.textContent ?? '').replace(/\s+/g, ' ');
    return { harness, component, text };
  }

  it('shows every §15 field on a card, including its blocking indicators', async () => {
    const { text, harness } = await render([card()]);
    const cardText = (
      harness.routeNativeElement!.querySelector('.card')!.textContent ?? ''
    ).replace(/\s+/g, ' ');

    for (const expected of [
      'PMH-1',
      'Build API',
      'Alta',
      'Build › Public API',
      'Codex',
      'Agente IA',
      '45%',
      'Subtareas 1/2',
      'Depende de 1 · 1 abierta',
      'Vence 10 Oct',
      'Bloqueada',
    ]) {
      expect(cardText).toContain(expected);
    }
    expect(harness.routeNativeElement!.querySelector('.card--blocked')).not.toBeNull();
    // The reason is text on the card, not only a tooltip (Roadmap UX-03c1).
    expect(harness.routeNativeElement!.querySelector('.card__alert-reason')?.textContent).toContain(
      'Waiting on credentials',
    );
    expect(text()).toContain('EN DESARROLLO');
    expect(text()).toContain('1 de 1 tareas');
  });

  it('marks the assignee of a task in development as fixed, and only then (Roadmap UX-01)', async () => {
    const { harness } = await render([
      card({ id: 't1', status: 'EN_DESARROLLO' }),
      card({ id: 't2', status: 'ASIGNADA' }),
    ]);
    const marks = Array.from(harness.routeNativeElement!.querySelectorAll('.lock-badge'));

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toContain('Asignación fija');
  });

  it('searches by title or Roadmap ID and says when nothing matches', async () => {
    const { component, harness, text } = await render([
      card(),
      card({
        id: 't2',
        externalId: 'PMH-2',
        title: 'Write docs',
        assignee: null,
        assigneeActorId: null,
      }),
    ]);

    component.patchFilters({ search: 'pmh-2' });
    harness.detectChanges();
    expect(text()).toContain('1 de 2 tareas');
    expect(text()).toContain('Write docs');
    expect(text()).not.toContain('Build API');

    component.patchFilters({ search: 'nothing like this' });
    harness.detectChanges();
    expect(text()).toContain('Ninguna tarea coincide con estos filtros.');

    component.clearFilters();
    harness.detectChanges();
    expect(text()).toContain('2 de 2 tareas');
  });

  it('groups the board into swimlanes', async () => {
    const { component, harness } = await render([
      card(),
      card({ id: 't2', title: 'Write docs', assignee: null, assigneeActorId: null }),
    ]);

    component.groupBy.set('assignee');
    harness.detectChanges();

    const laneTitles = Array.from(harness.routeNativeElement!.querySelectorAll('.lane__title')).map(
      (title) => title.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(laneTitles).toEqual(['Codex 1', 'Sin asignar 1']);
  });

  it('moves a card only on a legal drop, then reloads the board', async () => {
    const assigned = card({ roadmapTable: 'ACTIVE', dependencyCounts: { total: 0, open: 0 } });
    const { component } = await render([assigned]);
    const drop = (from: object, to: object) =>
      ({
        item: { data: assigned },
        previousContainer: from,
        container: to,
      }) as unknown as CdkDragDrop<TaskCard[]>;

    await component.onDrop(drop({}, {}), 'QA');
    expect(transition).not.toHaveBeenCalled();

    await component.onDrop(drop({}, {}), 'EN_DESARROLLO');
    expect(transition).toHaveBeenCalledWith('p1', 't1', 'EN_DESARROLLO');
    expect(listForProject).toHaveBeenCalledTimes(2);
  });

  it('offers "Nueva tarea" only to a member holding task.write (Roadmap SECURITY-02)', async () => {
    const allowed = await render([card()], ['task.write']);
    expect(allowed.harness.routeNativeElement!.textContent).toContain('Nueva tarea');
  });

  it('hides "Nueva tarea" from a member without task.write', async () => {
    const readOnly = await render([card()], []);
    expect(readOnly.harness.routeNativeElement!.textContent).not.toContain('Nueva tarea');
  });

  describe('long columns (Roadmap UX-02b)', () => {
    const finished = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        card({
          id: `d${index}`,
          externalId: `PMH-${index}`,
          title: `Done ${index}`,
          status: 'TERMINADA',
        }),
      );
    const cardsIn = (root: HTMLElement) => root.querySelectorAll('.card').length;

    it('shows the first cards of a long column, says how many more there are, and counts them all in its title', async () => {
      const { harness, text } = await render(finished(COLUMN_CAP + 4));

      expect(cardsIn(harness.routeNativeElement!)).toBe(COLUMN_CAP);
      expect(text()).toContain('Mostrar 4 más');
      expect(text()).toContain(String(COLUMN_CAP + 4));
    });

    it('opens the column on request and closes it again', async () => {
      const { harness, text } = await render(finished(COLUMN_CAP + 4));
      const root = harness.routeNativeElement!;
      const more = () => root.querySelector<HTMLButtonElement>('.column__more')!;

      more().click();
      harness.detectChanges();
      expect(cardsIn(root)).toBe(COLUMN_CAP + 4);
      expect(text()).toContain('Mostrar menos');
      expect(text()).not.toContain('más');

      more().click();
      harness.detectChanges();
      expect(cardsIn(root)).toBe(COLUMN_CAP);
    });

    it('offers nothing for a column that fits under the cap', async () => {
      const { harness } = await render(finished(COLUMN_CAP));

      expect(harness.routeNativeElement!.querySelector('.column__more')).toBeNull();
    });

    it('opens the column a card is dropped on, so the card does not seem to have vanished past the cap', async () => {
      const moving = card({ id: 'moving', status: 'QA', roadmapTable: 'ACTIVE' });
      const { component } = await render([moving, ...finished(COLUMN_CAP + 2)]);
      const target = component.listId('none', 'TERMINADA');

      await component.onDrop(
        {
          item: { data: moving },
          previousContainer: { id: component.listId('none', 'QA') },
          container: { id: target },
        } as unknown as CdkDragDrop<TaskCard[]>,
        'TERMINADA',
      );

      expect(component.expanded().has(target)).toBe(true);
    });
  });

  describe('the address holds the view (Roadmap UX-02b)', () => {
    it('reads the filters, the grouping and the order from the address', async () => {
      const { component } = await render(
        [card()],
        ['task.write'],
        '/projects/p1/kanban?q=api&priority=HIGH&blocked=1&group=epic&sort=priority',
      );

      expect(component.filters()).toMatchObject({
        search: 'api',
        priority: 'HIGH',
        blockedOnly: true,
      });
      expect(component.groupBy()).toBe('epic');
      expect(component.sortBy()).toBe('priority');
    });

    it('writes a change of the view into the address, without adding a page to go back to', async () => {
      const { component, harness } = await render([card()]);
      const router = TestBed.inject(Router);

      component.patchFilters({ search: 'sync' });
      component.groupBy.set('phase');
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(router.url).toBe('/projects/p1/kanban?q=sync&group=phase');
      component.clearFilters();
      component.groupBy.set('none');
      harness.detectChanges();
      await harness.fixture.whenStable();
      expect(router.url).toBe('/projects/p1/kanban');
    });

    it('brings a board back to the view it was left with when the address says nothing', async () => {
      TestBed.inject(BoardMemory).remember('p1', { q: 'left', priority: 'LOW' });

      const { component, harness } = await render([card()]);
      await harness.fixture.whenStable();

      expect(component.filters()).toMatchObject({ search: 'left', priority: 'LOW' });
      expect(TestBed.inject(Router).url).toBe('/projects/p1/kanban?q=left&priority=LOW');
    });

    it('lets what the address names win over what was left', async () => {
      TestBed.inject(BoardMemory).remember('p1', { q: 'left' });

      const { component } = await render([card()], ['task.write'], '/projects/p1/kanban?q=named');

      expect(component.filters().search).toBe('named');
    });
  });

  describe('on a phone (Roadmap UX-02b)', () => {
    const phone = (compact: boolean) => {
      TestBed.inject(Viewport).compact.set(compact);
    };

    it('folds the filters behind a button that says how many things are set, and unfolds them on request', async () => {
      phone(true);
      const { harness, component } = await render(
        [card()],
        ['task.write'],
        '/projects/p1/kanban?priority=HIGH&group=epic',
      );
      const root = harness.routeNativeElement!;

      expect(root.querySelector('#board-controls')).toBeNull();
      const toggle = root.querySelector<HTMLButtonElement>('.board-toolbar__toggle')!;
      expect(toggle.textContent).toContain('Filtros y vista (2)');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      // The search stays where it can be reached.
      expect(root.querySelector('input[type="search"]')).not.toBeNull();

      toggle.click();
      harness.detectChanges();

      expect(component.toolbarOpen()).toBe(true);
      expect(root.querySelector('#board-controls')).not.toBeNull();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('shows every control, and no button to fold them, on a wide screen', async () => {
      phone(false);
      const { harness } = await render([card()]);
      const root = harness.routeNativeElement!;

      expect(root.querySelector('.board-toolbar__toggle')).toBeNull();
      expect(root.querySelector('#board-controls')).not.toBeNull();
    });
  });
});
