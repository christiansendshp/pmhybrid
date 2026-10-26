import { describe, expect, it } from 'vitest';
import {
  isComplete,
  phaseVerdict,
  tallyPhases,
  type PhaseTally,
} from './phase-completion.util.js';

const group = (phaseId: string | null, status: string, count: number) => ({
  phaseId,
  status,
  count,
});

describe('tallyPhases (Roadmap TASK-41)', () => {
  it('adds the work tasks of each phase and how many of them are not done', () => {
    const tallies = tallyPhases([
      group('a', 'TERMINADA', 3),
      group('a', 'EN_DESARROLLO', 1),
      group('a', 'QA', 2),
      group('b', 'TERMINADA', 4),
    ]);

    expect([...tallies]).toEqual([
      ['a', { total: 6, open: 3 }],
      ['b', { total: 4, open: 0 }],
    ]);
  });

  it('leaves out the tasks that belong to no phase', () => {
    expect(tallyPhases([group(null, 'PENDIENTE', 5)]).size).toBe(0);
  });

  it('has no entry for a phase with no tasks', () => {
    expect(tallyPhases([]).get('a')).toBeUndefined();
  });
});

describe('isComplete', () => {
  it.each<[string, PhaseTally | undefined, boolean]>([
    ['every task done', { total: 3, open: 0 }, true],
    ['one task open', { total: 3, open: 1 }, false],
    ['every task open', { total: 3, open: 3 }, false],
    ['no tasks at all', undefined, false],
    ['a tally of nothing', { total: 0, open: 0 }, false],
  ])('says %s is complete: %s', (_label, tally, expected) => {
    expect(isComplete(tally)).toBe(expected);
  });
});

describe('phaseVerdict', () => {
  const done: PhaseTally = { total: 2, open: 0 };
  const open: PhaseTally = { total: 2, open: 1 };

  it('announces a phase that is complete and was not announced', () => {
    expect(phaseVerdict(done, false)).toBe('ANNOUNCE');
  });

  it('does not announce a phase again', () => {
    expect(phaseVerdict(done, true)).toBe('NONE');
  });

  it('forgets the announcement of a phase that has an open task again', () => {
    expect(phaseVerdict(open, true)).toBe('REOPEN');
  });

  it('does nothing for a phase that is open and was never announced', () => {
    expect(phaseVerdict(open, false)).toBe('NONE');
  });

  it('never announces a phase with no tasks, and forgets one that lost them all', () => {
    expect([
      phaseVerdict(undefined, false),
      phaseVerdict(undefined, true),
    ]).toEqual(['NONE', 'REOPEN']);
  });
});
