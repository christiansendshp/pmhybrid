import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardFilters, NO_FILTERS } from '../../core/board.js';
import { DEFAULT_LIST, ListState } from '../../core/board-query.js';
import { TaskCard, TaskTablePage, TasksService } from '../../core/tasks.service.js';
import { TABLE_PAGE_SIZE, TaskTable } from './task-table.js';

function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 't1',
    projectId: 'p1',
    externalId: 'PMH-1',
    title: 'Build API',
    description: null,
    status: 'EN_DESARROLLO',
    phaseId: null,
    epicId: null,
    templateId: null,
    parentTaskId: null,
    assigneeActorId: null,
    priority: null,
    entryType: null,
    progressPercent: null,
    acceptanceCriteria: null,
    startDate: null,
    estimatedDate: null,
    dueDate: null,
    completedAt: null,
    statusChangedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    instantClose: false,
    rowGone: false,
    ledgerStage: null,
    ledgerNote: null,
    reviewerActorId: null,
    reviewRequestedAt: null,
    roadmapTable: 'ACTIVE',
    blockedReason: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-16T09:00:00.000Z',
    assignee: null,
    reviewer: null,
    computedProgress: 0,
    subtaskCounts: { total: 0, done: 0 },
    dependencyCounts: { total: 0, open: 0 },
    ...overrides,
  };
}

const page = (items: TaskCard[], total = items.length): TaskTablePage => ({
  total,
  offset: 0,
  limit: TABLE_PAGE_SIZE,
  sort: 'createdAt',
  dir: 'asc',
  items,
});

/** A page that holds the table the way the real one does: the state is its own, the table only asks and reports. */
@Component({
  imports: [TaskTable],
  template: `
    <app-task-table
      projectId="p1"
      [filters]="filters()"
      [list]="list()"
      (sortChange)="sorts.push($event)"
      (pageChange)="pages.push($event)"
      (totalChange)="totals.push($event)"
    />
  `,
})
class Host {
  readonly filters = signal<BoardFilters>(NO_FILTERS);
  readonly list = signal<ListState>(DEFAULT_LIST);
  readonly sorts: unknown[] = [];
  readonly pages: number[] = [];
  readonly totals: number[] = [];
}

describe('TaskTable (Roadmap TASK-18)', () => {
  let table: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    table = vi.fn().mockResolvedValue(page([card()]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:projectId/list', component: Host }]),
        { provide: TasksService, useValue: { table } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    const host = await harness.navigateByUrl('/projects/p1/list', Host);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = () => harness.routeNativeElement!;
    const flush = async () => {
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    return { harness, host, root, flush };
  }

  it('says in the row of a task whose row left the Roadmap that it has none, and in no other (Roadmap GAP-47)', async () => {
    table.mockResolvedValue(
      page([card({ rowGone: true }), card({ id: 't2', externalId: 'PMH-2', rowGone: false })]),
    );
    const { root, flush } = await render();
    await flush();
    const rows = Array.from(root().querySelectorAll('tbody tr')).map((row) =>
      (row.textContent ?? '').replace(/\s+/g, ' '),
    );

    expect(rows[0]).toContain('Sin fila en el Roadmap: conflicto abierto');
    expect(rows[1]).not.toContain('Sin fila en el Roadmap');
  });

  it('asks the server for the first page with the filters and the order of the address', async () => {
    const { host, flush } = await render();
    host.filters.set({ ...NO_FILTERS, search: ' sync ', staleHours: 72, blockedOnly: true });
    host.list.set({ sort: 'priority', dir: 'desc', page: 3 });
    await flush();

    expect(table).toHaveBeenLastCalledWith('p1', {
      q: 'sync',
      stale: 72,
      blocked: true,
      sort: 'priority',
      dir: 'desc',
      limit: TABLE_PAGE_SIZE,
      offset: 2 * TABLE_PAGE_SIZE,
    });
  });

  it('shows what a card shows in words: the ID, the short title, the state, the agent with its model, the reviewer, the age and the dates', async () => {
    const long =
      'Modal de avance con fases nombradas durante la generación de un parte, reemplaza el mensaje genérico';
    table.mockResolvedValue(
      page([
        card({
          title: long,
          status: 'QA',
          priority: 'HIGH',
          dueDate: '2026-12-01T00:00:00.000Z',
          assignee: { id: 'a', displayName: 'Codex', kind: 'AI_AGENT', model: 'Claude Sonnet 5.5' },
          reviewer: { id: 'b', displayName: 'Ana', kind: 'HUMAN' },
          ledgerStage: 'EN_DESARROLLO',
          instantClose: true,
        }),
        card({ id: 't2', externalId: null, assignee: null, reviewer: null, status: 'TERMINADA' }),
      ]),
    );
    const { root, flush } = await render();
    await flush();
    const rows = Array.from(root().querySelectorAll('tbody tr')).map((row) =>
      (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

    expect(rows[0]).toContain('PMH-1');
    expect(rows[0]).toContain('QA');
    expect(rows[0]).toContain('Codex');
    expect(rows[0]).toContain('Agente IA');
    expect(rows[0]).toContain('Claude Sonnet 5.5');
    expect(rows[0]).toContain('Ana');
    expect(rows[0]).toContain('Alta');
    expect(rows[0]).toContain('hace 3 h');
    expect(rows[0]).toMatch(/1 (dic|Dec)\.? 2026/);
    expect(rows[0]).toContain('Cierre inmediato');
    // The title is cut like a card's, with the whole one as a tooltip.
    const title = root().querySelector<HTMLAnchorElement>('.task-table__title')!;
    expect(title.textContent?.endsWith('…')).toBe(true);
    expect(title.getAttribute('title')).toBe(long);
    expect(rows[1]).toContain('Sin asignar');
    expect(rows[1]).toContain('—');
  });

  it('says both stages when the ledger and the board disagree, and nothing when they agree', async () => {
    table.mockResolvedValue(
      page([
        card({ status: 'EN_DESARROLLO', ledgerStage: 'QA' }),
        card({ id: 't2', externalId: 'PMH-2', status: 'QA', ledgerStage: 'EN_DESARROLLO' }),
      ]),
    );
    const { root, flush } = await render();
    await flush();

    const notes = Array.from(root().querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('.task-table__note')).map((note) => note.textContent?.trim()),
    );

    expect(notes).toEqual([['Registro: QA · PM Hub: EN DESARROLLO'], []]);
  });

  it('links each task to its page and gives every header the column to order by, as a button', async () => {
    const { root, flush } = await render();
    await flush();

    const link = root().querySelector<HTMLAnchorElement>('.task-table__title')!;
    expect(link.getAttribute('href')).toBe('/projects/p1/tasks/t1');
    const headers = Array.from(root().querySelectorAll('thead th'));
    expect(headers).toHaveLength(9);
    for (const header of headers) {
      expect(header.querySelector('button')).not.toBeNull();
    }
  });

  it('says which column it is ordered by, and the way, for a screen reader', async () => {
    const { host, root, flush } = await render();
    host.list.set({ sort: 'title', dir: 'asc', page: 1 });
    await flush();

    const sorts = Array.from(root().querySelectorAll('thead th')).map((th) =>
      th.getAttribute('aria-sort'),
    );
    expect(sorts).toEqual([
      'none',
      'ascending',
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);

    host.list.set({ sort: 'title', dir: 'desc', page: 1 });
    await flush();
    expect(root().querySelectorAll('thead th')[1].getAttribute('aria-sort')).toBe('descending');
  });

  it('asks for the other column ascending, and for the same column the other way round', async () => {
    const { host, root, flush } = await render();
    const buttons = () => Array.from(root().querySelectorAll<HTMLButtonElement>('thead th button'));

    buttons()[1].click();
    expect(host.sorts).toEqual([{ sort: 'title', dir: 'asc' }]);

    host.list.set({ sort: 'title', dir: 'asc', page: 1 });
    await flush();
    buttons()[1].click();
    expect(host.sorts[1]).toEqual({ sort: 'title', dir: 'desc' });

    host.list.set({ sort: 'title', dir: 'desc', page: 1 });
    await flush();
    buttons()[5].click();
    expect(host.sorts[2]).toEqual({ sort: 'priority', dir: 'asc' });
  });

  it('says which tasks of how many it shows, and moves between the pages without going past either end', async () => {
    table.mockResolvedValue(
      page(
        Array.from({ length: TABLE_PAGE_SIZE }, (_, i) =>
          card({ id: `t${i}`, externalId: `PMH-${i}` }),
        ),
        120,
      ),
    );
    const { host, root, flush } = await render();
    await flush();
    const pager = () =>
      (root().querySelector('.task-table__pager')?.textContent ?? '').replace(/\s+/g, ' ');
    const [previous, next] = Array.from(
      root().querySelectorAll<HTMLButtonElement>('.task-table__pager button'),
    );

    expect(pager()).toContain('Tareas 1 a 50 de 120');
    expect(pager()).toContain('Página 1 de 3');
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    next.click();
    expect(host.pages).toEqual([2]);

    host.list.set({ ...DEFAULT_LIST, page: 3 });
    table.mockResolvedValue(
      page(
        Array.from({ length: 20 }, (_, i) => card({ id: `u${i}` })),
        120,
      ),
    );
    await flush();
    await flush();
    expect(pager()).toContain('Tareas 101 a 120 de 120');
    expect(
      Array.from(root().querySelectorAll<HTMLButtonElement>('.task-table__pager button'))[1]
        .disabled,
    ).toBe(true);
    expect(host.totals.at(-1)).toBe(120);
  });

  it('goes to the last page there is when the filters keep fewer tasks than the page starts at', async () => {
    const { host, flush } = await render();
    table.mockResolvedValue(page([], 60));

    host.list.set({ ...DEFAULT_LIST, page: 5 });
    await flush();
    await flush();

    expect(host.pages).toEqual([2]);
  });

  it('says so, in words, when no task matches', async () => {
    table.mockResolvedValue(page([]));
    const { root, flush } = await render();
    await flush();

    expect(root().textContent).toContain('Ninguna tarea coincide con estos filtros.');
    expect(root().textContent).toContain('Sin tareas');
  });

  it('says so, in words, when it cannot read the list', async () => {
    table.mockRejectedValue(new Error('boom'));
    const { root, flush } = await render();
    await flush();

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar la lista.',
    );
  });

  it('keeps the answer to the latest question when an earlier one arrives late', async () => {
    let releaseFirst: (value: TaskTablePage) => void = () => undefined;
    table.mockImplementationOnce(
      () => new Promise<TaskTablePage>((resolve) => (releaseFirst = resolve)),
    );
    const { host, root, flush } = await render();
    table.mockResolvedValue(page([card({ title: 'Latest answer' })]));
    host.filters.set({ ...NO_FILTERS, search: 'x' });
    await flush();

    releaseFirst(page([card({ title: 'Stale answer' })]));
    await flush();

    expect(root().textContent).toContain('Latest answer');
    expect(root().textContent).not.toContain('Stale answer');
  });

  it('is a region that can be scrolled with the keyboard, with a name', async () => {
    const { root, flush } = await render();
    await flush();

    const region = root().querySelector('.task-table')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Lista de tareas');
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});
