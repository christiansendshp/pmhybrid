import { describe, expect, it } from 'vitest';
import {
  buildWaiting,
  type BlockedTask,
  type LedgerBlock,
  type OpenConflict,
  type WaitingInput,
} from './build-waiting.util.js';

const day = (n: number) =>
  new Date(`2026-10-${String(n).padStart(2, '0')}T10:00:00Z`);

const blocked = (
  id: string,
  overrides: Partial<BlockedTask> = {},
): BlockedTask => ({
  id,
  externalId: `T-${id}`,
  title: `Task ${id}`,
  blockedReason: null,
  neededDecision: null,
  blockedSince: day(10),
  createdAt: day(1),
  phaseId: null,
  epicId: null,
  ...overrides,
});

const ledger = (
  taskId: string,
  overrides: Partial<LedgerBlock> = {},
): LedgerBlock => ({
  taskId,
  externalId: `T-${taskId}`,
  title: `Task ${taskId}`,
  from: 'PO',
  since: day(12),
  ...overrides,
});

const conflict = (
  id: string,
  overrides: Partial<OpenConflict> = {},
): OpenConflict => ({
  id,
  kind: 'CONCURRENT_FIELD_EDIT',
  detectedAt: day(14),
  task: { id: 'tc', externalId: 'T-c', title: 'Contested' },
  ...overrides,
});

const input = (overrides: Partial<WaitingInput> = {}): WaitingInput => ({
  blocked: [],
  holds: new Map(),
  ledgerBlocks: [],
  conflicts: [],
  phases: [],
  epics: [],
  ...overrides,
});

const kindsAndSince = (result: ReturnType<typeof buildWaiting>) =>
  result.items.map((item) => [item.kind, item.since.getDate()]);

describe('buildWaiting (Roadmap TASK-32)', () => {
  it('lists a blocked task with its reason, the decision it needs and since when', () => {
    const { items } = buildWaiting(
      input({
        blocked: [
          blocked('a', {
            blockedReason: 'Waiting for legal',
            neededDecision: 'PO decision',
          }),
        ],
      }),
    );

    expect(items).toEqual([
      {
        kind: 'BLOCKED',
        since: day(10),
        taskId: 'a',
        externalId: 'T-a',
        title: 'Task a',
        reason: 'Waiting for legal',
        neededDecision: 'PO decision',
        from: null,
        holds: 0,
      },
    ]);
  });

  it('counts, on each blocked task, the unfinished tasks that wait behind it', () => {
    const { items } = buildWaiting(
      input({
        blocked: [blocked('a'), blocked('b')],
        holds: new Map([['a', 3]]),
      }),
    );

    expect(
      items.map((item) => (item.kind === 'BLOCKED' ? item.holds : null)),
    ).toEqual([0, 3].reverse());
  });

  it('counts from the creation of a blocked task that does not say since when', () => {
    const { items } = buildWaiting(
      input({
        blocked: [blocked('a', { blockedSince: null, createdAt: day(3) })],
      }),
    );

    expect(items[0].since).toEqual(day(3));
  });

  it('lists what the ledger says waits on a person, when the task is not in the Blocked table', () => {
    const { items } = buildWaiting(
      input({ ledgerBlocks: [ledger('d', { from: 'PO' })] }),
    );

    expect(items).toEqual([
      {
        kind: 'DECISION',
        since: day(12),
        taskId: 'd',
        externalId: 'T-d',
        title: 'Task d',
        from: 'PO',
      },
    ]);
  });

  it('is one item, naming whom it waits for, when a blocked task is also blocked in the ledger', () => {
    const { items } = buildWaiting(
      input({
        blocked: [blocked('a')],
        ledgerBlocks: [ledger('a', { from: 'PO' })],
      }),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'BLOCKED', from: 'PO' });
  });

  it('lists an open conflict with the task it is about, and one that is about no task', () => {
    const { items } = buildWaiting(
      input({
        conflicts: [
          conflict('c1'),
          conflict('c2', {
            kind: 'UNRECOGNIZED_STATUS',
            task: null,
            detectedAt: day(15),
          }),
        ],
      }),
    );

    expect(
      items.map((item) =>
        item.kind === 'CONFLICT' ? [item.conflictId, item.title] : null,
      ),
    ).toEqual([
      ['c1', 'Contested'],
      ['c2', null],
    ]);
  });

  it('puts the longest waiting first, whatever kind it is', () => {
    const result = buildWaiting(
      input({
        blocked: [blocked('a', { blockedSince: day(10) })],
        ledgerBlocks: [ledger('d', { since: day(5) })],
        conflicts: [conflict('c', { detectedAt: day(7) })],
      }),
    );

    expect(kindsAndSince(result)).toEqual([
      ['DECISION', 5],
      ['CONFLICT', 7],
      ['BLOCKED', 10],
    ]);
  });

  it('puts a blocked task before a decision and a conflict that began the same moment', () => {
    const result = buildWaiting(
      input({
        blocked: [blocked('a', { blockedSince: day(8) })],
        ledgerBlocks: [ledger('d', { since: day(8) })],
        conflicts: [conflict('c', { detectedAt: day(8) })],
      }),
    );

    expect(result.items.map((item) => item.kind)).toEqual([
      'BLOCKED',
      'DECISION',
      'CONFLICT',
    ]);
  });

  it('is empty when nothing waits', () => {
    expect(buildWaiting(input())).toEqual({
      items: [],
      byPhase: [],
      byEpic: [],
    });
  });

  describe('the blocked tasks by phase and by epic', () => {
    const phases = [
      { id: 'p1', name: 'Build' },
      { id: 'p2', name: 'Launch' },
    ];
    const epics = [{ id: 'e1', name: 'API' }];

    it('counts them in each group, the largest first, and the ones in none as a group of their own', () => {
      const result = buildWaiting(
        input({
          blocked: [
            blocked('a', { phaseId: 'p2', epicId: 'e1' }),
            blocked('b', { phaseId: 'p1', epicId: 'e1' }),
            blocked('c', { phaseId: 'p1' }),
            blocked('d'),
          ],
          phases,
          epics,
        }),
      );

      expect(result.byPhase).toEqual([
        { id: 'p1', name: 'Build', blocked: 2 },
        { id: 'p2', name: 'Launch', blocked: 1 },
        { id: null, name: null, blocked: 1 },
      ]);
      expect(result.byEpic).toEqual([
        { id: 'e1', name: 'API', blocked: 2 },
        { id: null, name: null, blocked: 2 },
      ]);
    });

    it('add up to the blocked tasks, so none is lost to a group that no longer exists', () => {
      const result = buildWaiting(
        input({
          blocked: [
            blocked('a', { phaseId: 'gone' }),
            blocked('b', { phaseId: 'p1' }),
          ],
          phases,
        }),
      );

      expect(
        result.byPhase.reduce((total, group) => total + group.blocked, 0),
      ).toBe(2);
    });

    it('count only the tasks in the Blocked table, not the decisions or conflicts', () => {
      const result = buildWaiting(
        input({
          ledgerBlocks: [ledger('d')],
          conflicts: [conflict('c')],
          phases,
        }),
      );

      expect(result.byPhase).toEqual([]);
    });
  });
});
