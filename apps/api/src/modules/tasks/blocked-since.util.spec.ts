import { describe, expect, it } from 'vitest';
import { blockedStamp } from './blocked-since.util.js';

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
