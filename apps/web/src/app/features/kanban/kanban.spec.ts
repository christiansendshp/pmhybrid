import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyService, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { ProjectContext } from '../../core/project-context.js';
import { ProjectsService } from '../../core/projects.service.js';
import { SynchronizationService } from '../../core/synchronization.service.js';
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
    statusChangedAt: '2026-10-01T10:00:00.000Z',
    instantClose: false,
    ledgerStage: null,
    ledgerNote: null,
    reviewerActorId: null,
    reviewRequestedAt: null,
    roadmapTable: 'BLOCKED',
    blockedReason: 'Waiting on credentials',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    assignee: { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT', model: null },
    reviewer: null,
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
  let table: ReturnType<typeof vi.fn>;
  let listMembers: ReturnType<typeof vi.fn>;
  let unresolvedNames: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listMembers = vi.fn().mockResolvedValue([]);
    unresolvedNames = vi.fn().mockResolvedValue({ ledgerNames: [], ownerNames: [] });
    listForProject = vi.fn();
    transition = vi.fn().mockResolvedValue({});
    table = vi.fn().mockResolvedValue({
      total: 0,
      offset: 0,
      limit: 50,
      sort: 'createdAt',
      dir: 'asc',
      items: [],
    });
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [
              { path: 'kanban', component: Kanban },
              { path: 'list', component: Kanban, data: { view: 'list' } },
              { path: 'review', component: Kanban, data: { view: 'review' } },
              { path: 'agents', component: Kanban, data: { view: 'agents' } },
            ],
          },
        ]),
        { provide: TasksService, useValue: { listForProject, transition, table } },
        { provide: ProjectsService, useValue: { listMembers } },
        { provide: SynchronizationService, useValue: { unresolvedNames } },
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

  it('marks a card closed within minutes of starting with a text note, and no other (Roadmap TASK-12)', async () => {
    const { harness } = await render([
      card({ id: 't1', externalId: 'PMH-1', instantClose: true }),
      card({ id: 't2', externalId: 'PMH-2', instantClose: false }),
    ]);
    const notes = Array.from(harness.routeNativeElement!.querySelectorAll('.card')).map((element) =>
      Array.from(element.querySelectorAll('.card__note')).map((note) => note.textContent?.trim()),
    );

    // Words, not only a colour, and not in the alert colour: it says how the work was recorded.
    expect(notes).toEqual([['Cierre inmediato'], []]);
  });

  it('names the agent with its model, how long the task has been in its stage, the reviewer and the last ledger line (Roadmap TASK-13)', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const { harness } = await render([
      card({
        id: 't1',
        status: 'QA',
        statusChangedAt: twoDaysAgo,
        assignee: {
          id: 'codex',
          displayName: 'Codex',
          kind: 'AI_AGENT',
          model: 'Claude Sonnet 5.5',
        },
        reviewer: { id: 'ana', displayName: 'Ana García', kind: 'HUMAN' },
        ledgerNote: 'Handed over for review',
      }),
      card({
        id: 't2',
        externalId: 'PMH-2',
        status: 'PENDIENTE',
        statusChangedAt: new Date().toISOString(),
        assignee: null,
        reviewer: null,
        ledgerNote: null,
      }),
    ]);
    const cardOf = (externalId: string) =>
      Array.from(harness.routeNativeElement!.querySelectorAll('.card'))
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' '))
        .find((text) => text.includes(externalId))!;
    const cards = [cardOf('PMH-1'), cardOf('PMH-2')];

    for (const expected of [
      'Codex',
      'Agente IA',
      'Claude Sonnet 5.5',
      'en QA hace 2 d',
      'Revisor: Ana García (Humano)',
      'Último registro: Handed over for review',
    ]) {
      expect(cards[0], expected).toContain(expected);
    }
    // A card without an agent, a reviewer or a ledger line looks as before.
    expect(cards[1]).toContain('pendiente ahora');
    expect(cards[1]).not.toContain('Revisor');
    expect(cards[1]).not.toContain('Último registro');
    const title = harness
      .routeNativeElement!.querySelector('#ledger-t1')!
      .closest('.card')!
      .querySelector('.card__title')!;
    expect(title.getAttribute('aria-describedby')).toBe('ledger-t1');
    expect(harness.routeNativeElement!.querySelector('#ledger-t1')?.textContent).toContain(
      'Handed over for review',
    );
  });

  it('says both stages on a card whose status and ledger disagree, and nothing when they agree or the ledger is silent (Roadmap TASK-14)', async () => {
    const { harness } = await render([
      card({ id: 't1', externalId: 'PMH-1', status: 'EN_DESARROLLO', ledgerStage: 'QA' }),
      // A start in the ledger is development or QA alike.
      card({ id: 't2', externalId: 'PMH-2', status: 'QA', ledgerStage: 'EN_DESARROLLO' }),
      card({ id: 't3', externalId: 'PMH-3', status: 'QA', ledgerStage: 'QA' }),
      card({ id: 't4', externalId: 'PMH-4', status: 'QA', ledgerStage: null }),
    ]);
    const notes = Array.from(harness.routeNativeElement!.querySelectorAll('.card')).map((element) =>
      Array.from(element.querySelectorAll('.card__note')).map((note) => note.textContent?.trim()),
    );

    expect(notes).toEqual([['Registro: QA · PM Hub: EN DESARROLLO'], [], [], []]);
  });

  it('shows a long title shortened, with the whole title as a tooltip, and a short one as it is (Roadmap UX-04)', async () => {
    const long =
      'Modal de avance con fases nombradas durante la generación de un parte, reemplaza el mensaje genérico de empleados';
    const { harness } = await render([
      card({ id: 't1', title: long }),
      card({ id: 't2', title: 'Actualizar documentación del proyecto' }),
    ]);
    const links = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.card__title'),
    );
    const byText = (prefix: string) => links.find((link) => link.textContent?.startsWith(prefix))!;

    expect(byText('Modal de avance')?.textContent?.trim()).toBe(
      'Modal de avance con fases nombradas durante la generación…',
    );
    expect(byText('Modal de avance').getAttribute('title')).toBe(long);
    expect(byText('Actualizar').textContent?.trim()).toBe('Actualizar documentación del proyecto');
    expect(byText('Actualizar').hasAttribute('title')).toBe(false);
    // The task keeps its title: only the view is shorter, and the search still finds the whole of it.
    expect(harness.routeNativeElement!.textContent).not.toContain('mensaje genérico de empleados');
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

    it('reads the filters of Roadmap TASK-16 from a shared link and shows the same board', async () => {
      const longAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const agent = { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT' as const, model: null };
      const { component, harness } = await render(
        [
          card({
            id: 'a',
            externalId: 'PMH-A',
            status: 'EN_DESARROLLO',
            statusChangedAt: longAgo,
            assignee: agent,
            ledgerStage: 'QA',
          }),
          card({
            id: 'b',
            externalId: 'PMH-B',
            status: 'EN_DESARROLLO',
            statusChangedAt: new Date().toISOString(),
            assignee: agent,
            ledgerStage: 'QA',
          }),
          card({
            id: 'c',
            externalId: 'PMH-C',
            status: 'EN_DESARROLLO',
            statusChangedAt: longAgo,
            assignee: { ...agent, id: 'ana', kind: 'HUMAN' },
            ledgerStage: 'QA',
          }),
        ],
        ['task.write'],
        '/projects/p1/kanban?stale=168&kind=AI_AGENT&divergent=1',
      );

      expect(component.filters()).toMatchObject({
        staleHours: 168,
        assigneeKind: 'AI_AGENT',
        divergentOnly: true,
      });
      expect(
        Array.from(harness.routeNativeElement!.querySelectorAll('.card__id')).map(
          (id) => id.textContent,
        ),
      ).toEqual(['PMH-A']);
    });

    it('writes the filters of Roadmap TASK-16 into the address and remembers them with the board', async () => {
      const { component, harness } = await render([card()]);
      const router = TestBed.inject(Router);

      component.patchFilters({ staleHours: 24, reviewerId: 'ana', instantCloseOnly: true });
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(router.url).toBe('/projects/p1/kanban?stale=24&reviewer=ana&instant=1');
      expect(TestBed.inject(BoardMemory).recall('p1')).toEqual({
        stale: '24',
        reviewer: 'ana',
        instant: '1',
      });
      expect(component.filtersActive()).toBe(true);
      component.clearFilters();
      harness.detectChanges();
      await harness.fixture.whenStable();
      expect(router.url).toBe('/projects/p1/kanban');
      expect(component.filtersActive()).toBe(false);
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

  describe('the list view and the switcher (Roadmap TASK-17, TASK-18)', () => {
    const FIFTY = 50;
    /** A list long enough that the pages the tests ask for exist. */
    const longList = () =>
      table.mockResolvedValue({
        total: 300,
        offset: 0,
        limit: FIFTY,
        sort: 'createdAt',
        dir: 'asc',
        items: [],
      });

    it('keeps the board where it was, with its switcher and its grouping and order', async () => {
      const { harness, component } = await render([card()]);
      const root = harness.routeNativeElement!;

      expect(component.view()).toBe('board');
      expect(root.querySelector('h2')?.textContent?.trim()).toBe('Kanban');
      expect(root.querySelector('nav[aria-label="Vistas del tablero"]')).not.toBeNull();
      expect(root.querySelector('app-task-table')).toBeNull();
      expect(root.textContent).toContain('Agrupar por');
      expect(root.textContent).toContain('Ordenar por');
      expect(table).not.toHaveBeenCalled();
    });

    it('shows the tasks as a table on the route list, reads only its own page, and has no grouping or column order', async () => {
      const { harness, component } = await render([], ['task.write'], '/projects/p1/list');
      const root = harness.routeNativeElement!;

      expect(component.view()).toBe('list');
      expect(listForProject).not.toHaveBeenCalled();
      expect(root.querySelector('h2')?.textContent?.trim()).toBe('Lista');
      expect(root.querySelector('app-task-table')).not.toBeNull();
      expect(root.querySelector('.board')).toBeNull();
      expect(root.textContent).not.toContain('Agrupar por');
      expect(root.textContent).not.toContain('Ordenar por');
      expect(table).toHaveBeenCalledWith('p1', {
        sort: 'createdAt',
        dir: 'asc',
        limit: FIFTY,
        offset: 0,
      });
    });

    it('reads the filters, the order and the page of the list from its address', async () => {
      longList();
      const { component } = await render(
        [],
        ['task.write'],
        '/projects/p1/list?q=api&kind=AI_AGENT&order=title&dir=desc&page=3',
      );

      expect(component.filters()).toMatchObject({ search: 'api', assigneeKind: 'AI_AGENT' });
      expect(component.list()).toEqual({ sort: 'title', dir: 'desc', page: 3 });
      expect(table).toHaveBeenLastCalledWith('p1', {
        q: 'api',
        kind: 'AI_AGENT',
        sort: 'title',
        dir: 'desc',
        limit: FIFTY,
        offset: 2 * FIFTY,
      });
    });

    it('writes the order and the page into the address, and starts again at the first page when the tasks change', async () => {
      longList();
      const { component, harness } = await render([], ['task.write'], '/projects/p1/list');
      const router = TestBed.inject(Router);
      const settle = async () => {
        harness.detectChanges();
        await harness.fixture.whenStable();
      };

      component.onListSort({ sort: 'priority', dir: 'desc' });
      component.onListPage(2);
      await settle();
      expect(router.url).toBe('/projects/p1/list?order=priority&dir=desc&page=2');

      component.patchFilters({ search: 'sync' });
      await settle();
      expect(router.url).toBe('/projects/p1/list?q=sync&order=priority&dir=desc');

      component.onListPage(4);
      component.clearFilters();
      await settle();
      expect(router.url).toBe('/projects/p1/list?order=priority&dir=desc');
    });

    it('brings a list back to the order and the filters it was left with when the address says nothing', async () => {
      longList();
      TestBed.inject(BoardMemory).remember('p1', { q: 'left', order: 'dueDate', page: '2' });

      const { component } = await render([], ['task.write'], '/projects/p1/list');

      expect(component.filters().search).toBe('left');
      expect(component.list()).toEqual({ sort: 'dueDate', dir: 'asc', page: 2 });
    });

    it('ignores a value of the list that makes no sense instead of failing', async () => {
      const { component } = await render(
        [],
        ['task.write'],
        '/projects/p1/list?order=mood&dir=sideways&page=0',
      );

      expect(component.list()).toEqual({ sort: 'createdAt', dir: 'asc', page: 1 });
    });

    it('carries the filters, and only the filters, from one view to the other', async () => {
      const onBoard = await render(
        [card()],
        ['task.write'],
        '/projects/p1/kanban?q=api&stale=72&group=epic&sort=priority',
      );
      const hrefsOnBoard = Array.from(
        onBoard.harness.routeNativeElement!.querySelectorAll('.board-views__link'),
      ).map((link) => link.getAttribute('href'));

      expect(hrefsOnBoard).toEqual([
        '/projects/p1/kanban?q=api&stale=72',
        '/projects/p1/list?q=api&stale=72',
        '/projects/p1/review?q=api&stale=72',
        '/projects/p1/agents?q=api&stale=72',
      ]);
    });

    it('carries the filters of the list to the board, without its order or its page', async () => {
      const { harness } = await render(
        [],
        ['task.write'],
        '/projects/p1/list?q=api&divergent=1&order=title&dir=desc&page=3',
      );

      const hrefs = Array.from(
        harness.routeNativeElement!.querySelectorAll('.board-views__link'),
      ).map((link) => link.getAttribute('href'));

      expect(hrefs).toEqual([
        '/projects/p1/kanban?q=api&divergent=1',
        '/projects/p1/list?q=api&divergent=1',
        '/projects/p1/review?q=api&divergent=1',
        '/projects/p1/agents?q=api&divergent=1',
      ]);
    });

    it('counts the tasks the filters keep, as the list read them', async () => {
      table.mockResolvedValue({
        total: 7,
        offset: 0,
        limit: FIFTY,
        sort: 'createdAt',
        dir: 'asc',
        items: [],
      });

      const { harness } = await render([], ['task.write'], '/projects/p1/list');

      expect(
        harness.routeNativeElement!.querySelector('.board-toolbar__count')?.textContent,
      ).toContain('7 tareas');
    });
  });

  describe('the advisory limits (Roadmap TASK-15)', () => {
    const agent = { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT' as const, model: null };
    const person = { id: 'ana', displayName: 'Ana', kind: 'HUMAN' as const, model: null };
    const withLimits = (
      limits: Partial<Record<'wipLimitDevelopment' | 'wipLimitQa' | 'wipLimitAgent', number>>,
    ) =>
      TestBed.inject(ProjectContext).project.set({
        wipLimitDevelopment: null,
        wipLimitQa: null,
        wipLimitAgent: null,
        ...limits,
      } as never);
    const developing = (n: number, assignee: TaskCard['assignee'] & object = agent) =>
      Array.from({ length: n }, (_, i) =>
        card({
          id: `dev${assignee.id}${i}`,
          externalId: `D-${assignee.id}-${i}`,
          status: 'EN_DESARROLLO',
          assignee,
        }),
      );
    const headers = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('.column__title')).map((h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );

    it('says how full a column is against its limit, and that it is exceeded, in words and with a mark', async () => {
      withLimits({ wipLimitDevelopment: 2, wipLimitQa: 3 });
      const { harness } = await render([
        ...developing(3),
        card({ id: 'q', externalId: 'Q-1', status: 'QA' }),
      ]);

      const [, , dev, qa] = headers(harness.routeNativeElement!);

      expect(dev).toBe('EN DESARROLLO 3/2 ! excedido');
      expect(qa).toBe('QA 1/3');
      const mark = harness.routeNativeElement!.querySelector('.wip--over .wip__mark');
      expect(mark?.getAttribute('aria-hidden')).toBe('true');
    });

    it('writes the plain count of a column that has no limit, as it always did', async () => {
      withLimits({ wipLimitDevelopment: 2 });
      const { harness } = await render([
        ...developing(1),
        card({ id: 'q', externalId: 'Q-1', status: 'QA' }),
      ]);

      const [pending, assigned, dev, qa, done] = headers(harness.routeNativeElement!);

      expect(pending).toBe('PENDIENTE0');
      expect(assigned).toBe('ASIGNADA0');
      expect(dev).toBe('EN DESARROLLO 1/2');
      expect(qa).toBe('QA1');
      expect(done).toBe('TERMINADA0');
    });

    it('counts the whole project against the limit, not only what the filters leave', async () => {
      withLimits({ wipLimitDevelopment: 2 });
      const { harness, component } = await render(developing(3));

      component.patchFilters({ search: 'no task has this' });
      harness.detectChanges();

      expect(component.columnWip('EN_DESARROLLO')).toEqual({ count: 3, limit: 2, exceeded: true });
    });

    it('says nothing without limits: nothing about them appears on the board', async () => {
      withLimits({});
      const { harness } = await render(developing(5));

      expect(harness.routeNativeElement!.querySelector('.wip')).toBeNull();
      expect(headers(harness.routeNativeElement!)[2]).toBe('EN DESARROLLO5');
    });

    it('shows the limit per agent on the lane of an agent, and not on that of a person, when grouped by assignee', async () => {
      withLimits({ wipLimitAgent: 1 });
      const { harness, component } = await render([
        ...developing(2, agent),
        ...developing(3, person),
      ]);

      component.groupBy.set('assignee');
      harness.detectChanges();
      const lanes = Array.from(harness.routeNativeElement!.querySelectorAll('.lane__title')).map(
        (h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );

      expect(lanes.find((lane) => lane.startsWith('Codex'))).toContain(
        'en desarrollo 2/1 ! excedido',
      );
      expect(lanes.find((lane) => lane.startsWith('Ana'))).not.toContain('en desarrollo');
      // The columns inside lanes are the lane's own, so they carry no project limit.
      expect(headers(harness.routeNativeElement!).every((header) => !header.includes('/'))).toBe(
        true,
      );
    });

    it('lets a move into a full column through and says the column is now past its limit', async () => {
      withLimits({ wipLimitDevelopment: 1 });
      const moving = card({ id: 'moving', externalId: 'M-1', status: 'ASIGNADA' });
      const inDevelopment = developing(1);
      const { component } = await render([moving, ...inDevelopment]);
      // After the move the board is read again: the moved task is in development too.
      listForProject.mockResolvedValue([{ ...moving, status: 'EN_DESARROLLO' }, ...inDevelopment]);

      await component.onDrop(
        {
          item: { data: moving },
          previousContainer: { id: component.listId('none', 'ASIGNADA') },
          container: { id: component.listId('none', 'EN_DESARROLLO') },
        } as unknown as CdkDragDrop<TaskCard[]>,
        'EN_DESARROLLO',
      );

      expect(transition).toHaveBeenCalledWith('p1', 'moving', 'EN_DESARROLLO');
      expect(component.boardError()).toBeNull();
      expect(component.wipNotice()).toBe(
        'EN DESARROLLO queda en 2/1: excedido. El límite avisa, no impide mover tareas.',
      );
    });

    it('says nothing after a move that leaves the column within its limit', async () => {
      withLimits({ wipLimitDevelopment: 3 });
      const moving = card({ id: 'moving', externalId: 'M-1', status: 'ASIGNADA' });
      const { component } = await render([moving]);
      listForProject.mockResolvedValue([{ ...moving, status: 'EN_DESARROLLO' }]);

      await component.onDrop(
        {
          item: { data: moving },
          previousContainer: { id: component.listId('none', 'ASIGNADA') },
          container: { id: component.listId('none', 'EN_DESARROLLO') },
        } as unknown as CdkDragDrop<TaskCard[]>,
        'EN_DESARROLLO',
      );

      expect(component.wipNotice()).toBeNull();
    });
  });

  describe('the review queue view (Roadmap TASK-19)', () => {
    it('reads only the tasks in QA and shows them as a queue, without the columns of the board', async () => {
      const waiting = card({ id: 'w', externalId: 'W-1', status: 'QA' });
      const { harness, component } = await render([waiting], ['task.write'], '/projects/p1/review');
      const root = harness.routeNativeElement!;

      expect(component.view()).toBe('review');
      expect(listForProject).toHaveBeenCalledWith('p1', { status: 'QA' });
      expect(table).not.toHaveBeenCalled();
      expect(root.querySelector('h2')?.textContent?.trim()).toBe('En revisión');
      expect(root.querySelector('app-review-queue')).not.toBeNull();
      expect(root.querySelector('.board')).toBeNull();
      expect(root.querySelector('.review-item__id')?.textContent).toBe('W-1');
      expect(root.textContent).not.toContain('Agrupar por');
    });

    it('keeps the board loading every task, as before', async () => {
      await render([card()]);

      expect(listForProject).toHaveBeenCalledWith('p1', {});
    });

    it('narrows the queue with the same filters as the board', async () => {
      const mine = card({ id: 'm', externalId: 'M-1', status: 'QA', priority: 'HIGH' });
      const other = card({ id: 'o', externalId: 'O-1', status: 'QA', priority: 'LOW' });
      const { harness } = await render(
        [mine, other],
        ['task.write'],
        '/projects/p1/review?priority=HIGH',
      );

      const ids = Array.from(harness.routeNativeElement!.querySelectorAll('.review-item__id')).map(
        (id) => id.textContent,
      );

      expect(ids).toEqual(['M-1']);
    });

    it('writes only the filters into its address, never the grouping or the order of the board', async () => {
      TestBed.inject(BoardMemory).remember('p1', { group: 'epic', sort: 'priority', q: 'left' });

      const { harness } = await render([], ['task.write'], '/projects/p1/review');
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/projects/p1/review?q=left');
    });
  });

  describe('the view by agent (Roadmap TASK-20)', () => {
    const agentMember = (id: string, name: string) => ({
      id: `m-${id}`,
      projectId: 'p1',
      actorId: id,
      joinedAt: '2026-09-01T00:00:00.000Z',
      isActive: true,
      actor: { id, displayName: name, kind: 'AI_AGENT' as const, email: null },
    });
    const held = (id: string, name: string, status: TaskCard['status'], externalId: string) =>
      card({
        id: externalId,
        externalId,
        status,
        assignee: { id, displayName: name, kind: 'AI_AGENT', model: null },
      });

    it('makes a lane for every agent of the project, the idle one too, with its tasks by stage', async () => {
      listMembers.mockResolvedValue([
        agentMember('codex', 'Codex'),
        agentMember('idle', 'Idle Bot'),
      ]);
      const { harness, component } = await render(
        [held('codex', 'Codex', 'QA', 'C-1'), held('codex', 'Codex', 'EN_DESARROLLO', 'C-2')],
        ['task.write'],
        '/projects/p1/agents',
      );
      const root = harness.routeNativeElement!;

      expect(component.view()).toBe('agents');
      expect(root.querySelector('h2')?.textContent?.trim()).toBe('Por agente');
      const lanes = Array.from(root.querySelectorAll('.agent-lane__title')).map((h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      expect(lanes[0]).toContain('Codex');
      expect(lanes[0]).toContain('2 tareas');
      expect(lanes[1]).toContain('Idle Bot');
      expect(root.textContent).toContain('Sin tareas: este agente está libre.');
      expect(root.querySelector('.board')).toBeNull();
    });

    it('lists the names no registered agent answers to as a lane of their own, with how often and why', async () => {
      listMembers.mockResolvedValue([agentMember('codex', 'Codex')]);
      unresolvedNames.mockResolvedValue({
        ledgerNames: [
          { name: 'claude-sonnet-5-5', events: 731, reason: 'UNKNOWN' },
          { name: 'claude', events: 1, reason: 'AMBIGUOUS' },
        ],
        ownerNames: [],
      });
      const { harness } = await render([], ['task.write'], '/projects/p1/agents');
      const lane = harness.routeNativeElement!.querySelector('.agent-lane--unregistered')!;
      const text = (lane.textContent ?? '').replace(/\s+/g, ' ');

      expect(text).toContain('Sin registrar');
      expect(text).toContain(
        'claude-sonnet-5-5 — 731 entradas; ningún agente responde a este nombre',
      );
      expect(text).toContain('claude — 1 entrada; dos agentes responden a este nombre');
      expect(unresolvedNames).toHaveBeenCalledWith('p1');
    });

    it('shows no lane for names when there are none, and says so when the list could not be read', async () => {
      listMembers.mockResolvedValue([agentMember('codex', 'Codex')]);
      const quiet = await render([], ['task.write'], '/projects/p1/agents');
      expect(
        quiet.harness.routeNativeElement!.querySelector('.agent-lane--unregistered'),
      ).toBeNull();
      expect(quiet.component.unregisteredFailed()).toBe(false);
    });

    it('says the list of names could not be read, without losing the lanes', async () => {
      listMembers.mockResolvedValue([agentMember('codex', 'Codex')]);
      unresolvedNames.mockRejectedValue(new Error('boom'));

      const { harness, component } = await render([], ['task.write'], '/projects/p1/agents');

      expect(component.unregisteredFailed()).toBe(true);
      expect(harness.routeNativeElement!.textContent).toContain(
        'No se pudo leer la lista de nombres sin registrar',
      );
      expect(
        harness.routeNativeElement!.querySelector('.agent-lane__title')?.textContent,
      ).toContain('Codex');
    });

    it('says the work in development of an agent against the limit per agent, from every task of the project', async () => {
      TestBed.inject(ProjectContext).project.set({ wipLimitAgent: 1 } as never);
      listMembers.mockResolvedValue([agentMember('codex', 'Codex')]);
      const { harness } = await render(
        [
          held('codex', 'Codex', 'EN_DESARROLLO', 'C-1'),
          held('codex', 'Codex', 'EN_DESARROLLO', 'C-2'),
        ],
        ['task.write'],
        '/projects/p1/agents?q=C-1',
      );

      const title = (
        harness.routeNativeElement!.querySelector('.agent-lane__title')?.textContent ?? ''
      ).replace(/\s+/g, ' ');

      // The filter keeps one task in the lane; the limit is read against the two the agent really has.
      expect(title).toContain('1 tarea');
      expect(title).toContain('en desarrollo 2/1 ! excedido');
    });

    it('counts the tasks no agent holds instead of hiding them', async () => {
      listMembers.mockResolvedValue([agentMember('codex', 'Codex')]);
      const { harness } = await render(
        [held('codex', 'Codex', 'QA', 'C-1'), card({ id: 'x', externalId: 'X-1', assignee: null })],
        ['task.write'],
        '/projects/p1/agents',
      );

      expect(
        harness.routeNativeElement!.querySelector('.agent-lanes__note')?.textContent,
      ).toContain('1 tarea sin agente');
    });

    it('does not ask for the names on the board', async () => {
      await render([card()]);

      expect(unresolvedNames).not.toHaveBeenCalled();
    });
  });
});
