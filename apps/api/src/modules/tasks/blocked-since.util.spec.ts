import { describe, expect, it } from 'vitest';
import {
  blockedMove,
  blockedStamp,
  netBlockedMoves,
} from './blocked-since.util.js';

const NOW = new Date('2026-10-26T12:00:00Z');

describe('blockedStamp (Roadmap TASK-31)', () => {
  it.each([['ACTIVE'], ['NEAR_TERM'], [null], [undefined]])(
    'starts the count when a task enters the Blocked table from %s',
    (from) => {
      expect(blockedStamp(from, 'BLOCKED', NOW)).toEqual({ blockedSince: NOW });
    },
  );

  it.each([['ACTIVE'], ['NEAR_TERM'], [null]])(
    'ends the count when a task leaves the Blocked table for %s',
    (to) => {
      expect(blockedStamp('BLOCKED', to, NOW)).toEqual({ blockedSince: null });
    },
  );

  it('keeps the count of a task that stays in the Blocked table', () => {
    expect(blockedStamp('BLOCKED', 'BLOCKED', NOW)).toEqual({});
  });

  it.each([
    ['ACTIVE', 'NEAR_TERM'],
    ['NEAR_TERM', 'ACTIVE'],
    [null, 'ACTIVE'],
    ['ACTIVE', null],
    [null, null],
  ])('has nothing to write for a move between %s and %s', (from, to) => {
    expect(blockedStamp(from, to, NOW)).toEqual({});
  });

  it('stamps the present moment when none is given', () => {
    const before = Date.now();

    const { blockedSince } = blockedStamp('ACTIVE', 'BLOCKED');

    expect(blockedSince?.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('blockedMove (Roadmap TASK-40)', () => {
  const table = (roadmapTable: string | null) => ({ roadmapTable });

  it.each([['ACTIVE'], ['NEAR_TERM'], [null]])(
    'says a task entering the Blocked table from %s was blocked',
    (from) => {
      expect(blockedMove(table(from), table('BLOCKED'))).toBe('BLOCKED');
    },
  );

  it.each([['ACTIVE'], ['NEAR_TERM']])(
    'says a task leaving the Blocked table for %s was unblocked',
    (to) => {
      expect(blockedMove(table('BLOCKED'), table(to))).toBe('UNBLOCKED');
    },
  );

  it('says nothing of a task that stays in the Blocked table', () => {
    expect(blockedMove(table('BLOCKED'), table('BLOCKED'))).toBeNull();
  });

  it('says nothing of a row that vanished: it is in no table, not in another', () => {
    expect(blockedMove(table('BLOCKED'), table(null))).toBeNull();
  });

  it('says nothing of a change that completed the task: it is done, not unblocked', () => {
    expect(
      blockedMove(table('BLOCKED'), {
        status: 'TERMINADA',
        roadmapTable: null,
      }),
    ).toBeNull();
  });

  it.each([
    ['ACTIVE', 'NEAR_TERM'],
    [null, 'ACTIVE'],
    ['ACTIVE', null],
  ])(
    'says nothing of a move between %s and %s, neither of which is Blocked',
    (from, to) => {
      expect(blockedMove(table(from), table(to))).toBeNull();
    },
  );

  it.each([[undefined], [null], ['text'], [{}]])(
    'says nothing when the audit event says nothing readable (%j)',
    (value) => {
      expect(blockedMove(value, value)).toBeNull();
    },
  );
});

describe('netBlockedMoves (Roadmap TASK-40)', () => {
  const change = (
    entityId: string,
    from: string | null,
    to: string | null,
  ) => ({
    entityId,
    previousValue: { roadmapTable: from },
    newValue: { roadmapTable: to },
  });

  it('gives what each task ended up doing, one entry per task', () => {
    const moves = netBlockedMoves([
      change('a', 'ACTIVE', 'BLOCKED'),
      change('b', 'BLOCKED', 'ACTIVE'),
      change('c', 'ACTIVE', 'NEAR_TERM'),
    ]);

    expect([...moves]).toEqual([
      ['a', 'BLOCKED'],
      ['b', 'UNBLOCKED'],
    ]);
  });

  it('says nothing of a task blocked and unblocked again within the run: it is news to nobody', () => {
    const moves = netBlockedMoves([
      change('a', 'ACTIVE', 'BLOCKED'),
      change('a', 'BLOCKED', 'ACTIVE'),
    ]);

    expect(moves.size).toBe(0);
  });

  it('reads a task unblocked and blocked again within the run as not moved', () => {
    const moves = netBlockedMoves([
      change('a', 'BLOCKED', 'ACTIVE'),
      change('a', 'ACTIVE', 'BLOCKED'),
    ]);

    expect(moves.size).toBe(0);
  });

  it('reads a task that went through another table on its way into Blocked as blocked', () => {
    const moves = netBlockedMoves([
      change('a', null, 'ACTIVE'),
      change('a', 'ACTIVE', 'BLOCKED'),
    ]);

    expect([...moves]).toEqual([['a', 'BLOCKED']]);
  });

  it('has no moves for no changes', () => {
    expect(netBlockedMoves([]).size).toBe(0);
  });
});
