import { describe, expect, it } from 'vitest';
import { sortTaskRows, type TaskSortRow } from './task-table.util.js';

let sequence = 0;
function row(overrides: Partial<TaskSortRow> = {}): TaskSortRow {
  sequence += 1;
  return {
    id: `t${String(sequence).padStart(3, '0')}`,
    externalId: `PMH-${sequence}`,
    title: `Task ${sequence}`,
    status: 'PENDIENTE',
    priority: null,
    statusChangedAt: new Date('2026-10-01T00:00:00Z'),
    dueDate: null,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date(Date.UTC(2026, 8, sequence)),
    assignee: null,
    reviewer: null,
    ...overrides,
  };
}

const ids = (rows: TaskSortRow[]) => rows.map((r) => r.externalId);

describe('sortTaskRows (Roadmap TASK-18)', () => {
  it('reads a Roadmap ID the way a person does: PMH-2 before PMH-10, whatever the case', () => {
    const rows = [
      row({ externalId: 'pmh-10' }),
      row({ externalId: 'PMH-2' }),
      row({ externalId: 'PMH-1' }),
    ];

    expect(ids(sortTaskRows(rows, 'externalId', 'asc'))).toEqual([
      'PMH-1',
      'PMH-2',
      'pmh-10',
    ]);
    expect(ids(sortTaskRows(rows, 'externalId', 'desc'))).toEqual([
      'pmh-10',
      'PMH-2',
      'PMH-1',
    ]);
  });

  it('puts a task with no value last, ascending or descending', () => {
    const rows = [
      row({ externalId: 'NONE', dueDate: null }),
      row({ externalId: 'LATE', dueDate: new Date('2026-12-01T00:00:00Z') }),
      row({ externalId: 'SOON', dueDate: new Date('2026-11-01T00:00:00Z') }),
    ];

    expect(ids(sortTaskRows(rows, 'dueDate', 'asc'))).toEqual([
      'SOON',
      'LATE',
      'NONE',
    ]);
    expect(ids(sortTaskRows(rows, 'dueDate', 'desc'))).toEqual([
      'LATE',
      'SOON',
      'NONE',
    ]);
  });

  it('orders the status by the board, not by the alphabet, and the priority from the most urgent', () => {
    const byStatus = [
      row({ externalId: 'D', status: 'TERMINADA' }),
      row({ externalId: 'A', status: 'PENDIENTE' }),
      row({ externalId: 'C', status: 'QA' }),
      row({ externalId: 'B', status: 'EN_DESARROLLO' }),
    ];
    const byPriority = [
      row({ externalId: 'LOW', priority: 'LOW' }),
      row({ externalId: 'CRIT', priority: 'CRITICAL' }),
      row({ externalId: 'NONE', priority: null }),
      row({ externalId: 'HIGH', priority: 'HIGH' }),
    ];

    expect(ids(sortTaskRows(byStatus, 'status', 'asc'))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(ids(sortTaskRows(byPriority, 'priority', 'asc'))).toEqual([
      'CRIT',
      'HIGH',
      'LOW',
      'NONE',
    ]);
    expect(ids(sortTaskRows(byPriority, 'priority', 'desc'))).toEqual([
      'LOW',
      'HIGH',
      'CRIT',
      'NONE',
    ]);
  });

  it('orders by the name of the assignee and of the reviewer, with the tasks that have none last', () => {
    const rows = [
      row({ externalId: 'X', assignee: null }),
      row({ externalId: 'B', assignee: { displayName: 'bea' } }),
      row({ externalId: 'A', assignee: { displayName: 'Ana' } }),
    ];
    const reviewed = [
      row({ externalId: 'P', reviewer: { displayName: 'Pablo' } }),
      row({ externalId: 'Q', reviewer: { displayName: 'Ana' } }),
    ];

    expect(ids(sortTaskRows(rows, 'assignee', 'asc'))).toEqual(['A', 'B', 'X']);
    expect(ids(sortTaskRows(reviewed, 'reviewer', 'asc'))).toEqual(['Q', 'P']);
  });

  it('orders by the age in the stage: ascending is the shortest first', () => {
    const rows = [
      row({
        externalId: 'OLD',
        statusChangedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      row({
        externalId: 'NEW',
        statusChangedAt: new Date('2026-10-10T00:00:00Z'),
      }),
      row({
        externalId: 'MID',
        statusChangedAt: new Date('2026-10-01T00:00:00Z'),
      }),
    ];

    expect(ids(sortTaskRows(rows, 'age', 'asc'))).toEqual([
      'NEW',
      'MID',
      'OLD',
    ]);
    expect(ids(sortTaskRows(rows, 'age', 'desc'))).toEqual([
      'OLD',
      'MID',
      'NEW',
    ]);
  });

  it('breaks every tie by creation time and then id, so the order is the same on every page', () => {
    const first = row({
      externalId: 'FIRST',
      priority: 'HIGH',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });
    const second = row({
      externalId: 'SECOND',
      priority: 'HIGH',
      createdAt: new Date('2026-09-02T00:00:00Z'),
    });
    const sameTimeA = row({
      id: 'a',
      externalId: 'A',
      priority: 'HIGH',
      createdAt: new Date('2026-09-03T00:00:00Z'),
    });
    const sameTimeB = row({
      id: 'b',
      externalId: 'B',
      priority: 'HIGH',
      createdAt: new Date('2026-09-03T00:00:00Z'),
    });

    for (const dir of ['asc', 'desc'] as const) {
      expect(
        ids(
          sortTaskRows([sameTimeB, second, sameTimeA, first], 'priority', dir),
        ),
      ).toEqual(['FIRST', 'SECOND', 'A', 'B']);
    }
  });

  it('does not change the rows it was given', () => {
    const rows = [row({ externalId: 'B' }), row({ externalId: 'A' })];

    sortTaskRows(rows, 'externalId', 'asc');

    expect(ids(rows)).toEqual(['B', 'A']);
  });
});
