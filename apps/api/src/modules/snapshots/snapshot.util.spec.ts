import { describe, expect, it } from 'vitest';
import {
  dayKey,
  daysToReconstruct,
  tallyStatuses,
  totalsAtEndOf,
  type DatedTask,
} from './snapshot.util.js';

describe('tallyStatuses (Roadmap TASK-46)', () => {
  it('adds up the tasks of each status, every status being there', () => {
    expect(
      tallyStatuses([
        { status: 'PENDIENTE', count: 3 },
        { status: 'EN_DESARROLLO', count: 2 },
        { status: 'TERMINADA', count: 5 },
      ]),
    ).toEqual({
      total: 10,
      done: 5,
      byStatus: {
        PENDIENTE: 3,
        ASIGNADA: 0,
        EN_DESARROLLO: 2,
        QA: 0,
        TERMINADA: 5,
      },
    });
  });

  it('counts the groups of one status together', () => {
    expect(
      tallyStatuses([
        { status: 'QA', count: 1 },
        { status: 'QA', count: 4 },
      ]).byStatus.QA,
    ).toBe(5);
  });

  it('gives zeros for a project with no tasks', () => {
    expect(tallyStatuses([])).toEqual({
      total: 0,
      done: 0,
      byStatus: {
        PENDIENTE: 0,
        ASIGNADA: 0,
        EN_DESARROLLO: 0,
        QA: 0,
        TERMINADA: 0,
      },
    });
  });

  it('leaves out a status it does not know instead of counting it', () => {
    expect(tallyStatuses([{ status: 'SOMETHING_NEW', count: 9 }]).total).toBe(
      0,
    );
  });
});

describe('dayKey', () => {
  it('is the UTC day as YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-11-03T00:00:00.000Z'))).toBe('2026-11-03');
  });

  it('keeps the last moment of a UTC day in that day', () => {
    expect(dayKey(new Date('2026-11-03T23:59:59.999Z'))).toBe('2026-11-03');
  });
});

const at = (iso: string) => new Date(iso);
const task = (
  createdAt: string,
  completedAt: string | null = null,
  deletedAt: string | null = null,
): DatedTask => ({
  createdAt: at(createdAt),
  completedAt: completedAt === null ? null : at(completedAt),
  deletedAt: deletedAt === null ? null : at(deletedAt),
});

describe('totalsAtEndOf (Roadmap TASK-47)', () => {
  const day = at('2026-10-20T00:00:00.000Z');

  it('counts a task created that day, and not one created the next', () => {
    expect(
      totalsAtEndOf(
        [task('2026-10-20T23:59:59.999Z'), task('2026-10-21T00:00:00.000Z')],
        day,
      ),
    ).toEqual({ total: 1, done: 0 });
  });

  it('counts a task as done from the day it was completed, and not before', () => {
    const tasks = [task('2026-10-01T00:00:00Z', '2026-10-20T12:00:00Z')];

    expect([
      totalsAtEndOf(tasks, at('2026-10-19T00:00:00Z')),
      totalsAtEndOf(tasks, day),
    ]).toEqual([
      { total: 1, done: 0 },
      { total: 1, done: 1 },
    ]);
  });

  it('leaves out a task deleted before the end of the day, and keeps one deleted after it', () => {
    expect(
      totalsAtEndOf(
        [
          task('2026-10-01T00:00:00Z', null, '2026-10-20T08:00:00Z'),
          task('2026-10-01T00:00:00Z', null, '2026-10-21T08:00:00Z'),
        ],
        day,
      ),
    ).toEqual({ total: 1, done: 0 });
  });

  it('leaves out a task that was created after it was deleted: it never existed in that day', () => {
    expect(
      totalsAtEndOf(
        [task('2026-10-25T00:00:00Z', null, '2026-10-26T00:00:00Z')],
        day,
      ),
    ).toEqual({ total: 0, done: 0 });
  });

  it('gives zeros for no tasks', () => {
    expect(totalsAtEndOf([], day)).toEqual({ total: 0, done: 0 });
  });
});

describe('daysToReconstruct', () => {
  const today = at('2026-11-03T00:00:00.000Z');
  const long = at('2026-01-01T00:00:00.000Z');

  const keys = (days: Date[]) => days.map(dayKey);

  it('is the days before today, oldest first, without today', () => {
    expect(keys(daysToReconstruct(today, 3, new Set(), long))).toEqual([
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('leaves out the days that already have a snapshot', () => {
    expect(
      keys(daysToReconstruct(today, 3, new Set(['2026-11-01']), long)),
    ).toEqual(['2026-10-31', '2026-11-02']);
  });

  it('leaves out the days before the project existed, the day it was created included', () => {
    expect(
      keys(daysToReconstruct(today, 5, new Set(), at('2026-11-01T15:00:00Z'))),
    ).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('is empty for a project created today', () => {
    expect(
      daysToReconstruct(today, 5, new Set(), at('2026-11-03T08:00:00Z')),
    ).toEqual([]);
  });
});
