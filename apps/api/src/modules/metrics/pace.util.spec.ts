import { describe, expect, it } from 'vitest';
import { paceOf, weekStartOf, type PaceTask } from './pace.util.js';

// Monday 2026-10-26 is the week "now" is in; the weeks before it are complete.
const NOW = new Date('2026-10-28T15:30:00Z');
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

const task = (
  createdAt: string,
  completedAt: string | null = null,
  phaseId: string | null = null,
): PaceTask => ({
  createdAt: at(createdAt),
  completedAt: completedAt === null ? null : at(completedAt),
  phaseId,
});

/** One task finished in each of the given weeks' Wednesday, created eight weeks before (so it is no new work in the weeks read). */
const finishedIn = (...weekMondays: string[]): PaceTask[] =>
  weekMondays.map((monday) => {
    const done = new Date(`${monday}T12:00:00Z`);
    done.setUTCDate(done.getUTCDate() + 2);
    const created = new Date(done);
    created.setUTCDate(created.getUTCDate() - 56);
    return {
      createdAt: created,
      completedAt: done,
      phaseId: null,
    };
  });

describe('weekStartOf (Roadmap TASK-35)', () => {
  it.each([
    ['2026-10-26T00:00:00Z', '2026-10-26'],
    ['2026-10-28T15:30:00Z', '2026-10-26'],
    ['2026-11-01T23:59:59Z', '2026-10-26'],
    ['2026-11-02T00:00:00Z', '2026-11-02'],
    ['2026-01-01T10:00:00Z', '2025-12-29'],
  ])('puts %s in the week that begins on Monday %s', (moment, monday) => {
    expect(weekStartOf(new Date(moment)).toISOString().slice(0, 10)).toBe(
      monday,
    );
  });
});

describe('paceOf: the weeks (Roadmap TASK-35)', () => {
  it('has one point per week asked for, oldest first, the last being the week in progress', () => {
    const { weeks } = paceOf([], 4, NOW);

    expect(weeks.map((week) => [week.weekStart, week.partial])).toEqual([
      ['2026-10-05', false],
      ['2026-10-12', false],
      ['2026-10-19', false],
      ['2026-10-26', true],
    ]);
  });

  it('counts a task completed in a week, and one created in it, in that week and no other', () => {
    const { weeks } = paceOf(
      [task('2026-10-14', '2026-10-21'), task('2026-10-22')],
      3,
      NOW,
    );

    expect(
      weeks.map((week) => [week.weekStart, week.created, week.completed]),
    ).toEqual([
      ['2026-10-12', 1, 0],
      ['2026-10-19', 1, 1],
      ['2026-10-26', 0, 0],
    ]);
  });

  it('puts a moment on the boundary of two weeks in the week it opens', () => {
    const sunday = new Date('2026-10-25T23:59:59.999Z');
    const monday = new Date('2026-10-26T00:00:00.000Z');

    const { weeks } = paceOf(
      [
        { createdAt: sunday, completedAt: null, phaseId: null },
        { createdAt: monday, completedAt: null, phaseId: null },
      ],
      2,
      NOW,
    );

    expect(weeks.map((week) => week.created)).toEqual([1, 1]);
  });

  it('accumulates the scope and the done work at the end of each week, counting what came before the first week shown', () => {
    const { weeks } = paceOf(
      [
        task('2026-09-01', '2026-09-10'),
        task('2026-10-13'),
        task('2026-10-21', '2026-10-27'),
      ],
      3,
      NOW,
    );

    expect(weeks.map((week) => [week.scope, week.done])).toEqual([
      [2, 1],
      [3, 1],
      [3, 2],
    ]);
  });

  it('counts nothing of a task that appeared after the weeks shown', () => {
    const { weeks } = paceOf([task('2026-11-30')], 2, NOW);

    expect(weeks.map((week) => week.scope)).toEqual([0, 0]);
  });
});

describe('paceOf: the burn-up by phase', () => {
  const tasks = [
    task('2026-10-01', '2026-10-21', 'p1'),
    task('2026-10-01', null, 'p1'),
    task('2026-10-15', null, 'p2'),
    task('2026-10-15', '2026-10-27', null),
  ];

  it('has a line for each phase and one for the tasks of none', () => {
    const { byPhase } = paceOf(tasks, 2, NOW);

    expect(byPhase.map((phase) => phase.phaseId)).toEqual([null, 'p1', 'p2']);
  });

  it('adds up, week by week, to the scope and the done work of the project', () => {
    const { weeks, byPhase } = paceOf(tasks, 3, NOW);

    weeks.forEach((week, index) => {
      expect(
        byPhase.reduce((sum, phase) => sum + phase.weeks[index].scope, 0),
      ).toBe(week.scope);
      expect(
        byPhase.reduce((sum, phase) => sum + phase.weeks[index].done, 0),
      ).toBe(week.done);
    });
  });
});

describe('paceOf: the forecast', () => {
  it('declines to give a date with fewer than two complete weeks of history', () => {
    const { forecast } = paceOf(
      [task('2026-10-20', '2026-10-21'), task('2026-10-20')],
      4,
      NOW,
    );

    expect(forecast).toEqual({
      status: 'NOT_ENOUGH_HISTORY',
      openTasks: 1,
      windows: [],
      range: null,
    });
  });

  it('declines for a project with no tasks', () => {
    expect(paceOf([], 4, NOW).forecast.status).toBe('NOT_ENOUGH_HISTORY');
  });

  it('says nothing is open when every task is finished', () => {
    const { forecast } = paceOf(
      finishedIn('2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'),
      4,
      NOW,
    );

    expect(forecast.status).toBe('NOTHING_OPEN');
  });

  it('gives a range from the pace of the last two and the last four complete weeks, with the scope growth beside it', () => {
    // Four complete weeks, one task finished in each, 8 open, nothing new arriving.
    const tasks = [
      ...finishedIn('2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'),
      ...Array.from({ length: 8 }, () => task('2026-08-01')),
    ];

    const { forecast } = paceOf(tasks, 4, NOW);

    expect(forecast.status).toBe('OK');
    expect(forecast.openTasks).toBe(8);
    expect(
      forecast.windows.map((window) => [window.weeks, window.completedPerWeek]),
    ).toEqual([
      [2, 1],
      [4, 1],
    ]);
    // 8 open at 1 a week, from Wednesday 2026-10-28 15:30 UTC: eight weeks.
    expect(forecast.range).toEqual({ from: '2026-12-23', to: '2026-12-23' });
  });

  it('counts the work that keeps arriving, so the dates are later than ignoring it', () => {
    // Two finished per week, one new per week, 6 open: net one a week.
    const tasks = [
      ...finishedIn(
        '2026-10-05',
        '2026-10-05',
        '2026-10-12',
        '2026-10-12',
        '2026-10-19',
        '2026-10-19',
      ),
      task('2026-10-07'),
      task('2026-10-14'),
      task('2026-10-21'),
      ...Array.from({ length: 6 }, () => task('2026-08-01')),
    ];

    const [recent] = paceOf(tasks, 4, NOW).forecast.windows;

    // Last two complete weeks: 4 finished (2 a week), 2 new (1 a week), 9 open.
    expect(recent).toEqual({
      weeks: 2,
      completedPerWeek: 2,
      createdPerWeek: 1,
      finishesBy: '2026-12-30',
      finishesByIgnoringNewScope: '2026-11-29',
    });
  });

  it('says the work does not converge, and gives no date, when new work arrives as fast as it closes', () => {
    // One finished and one new in each of the three complete weeks, and 5 open from before.
    const tasks = [
      ...finishedIn('2026-10-05', '2026-10-12', '2026-10-19'),
      task('2026-10-06'),
      task('2026-10-13'),
      task('2026-10-20'),
      ...Array.from({ length: 5 }, () => task('2026-08-01')),
    ];

    const { forecast } = paceOf(tasks, 4, NOW);

    expect(forecast).toMatchObject({
      status: 'NOT_CONVERGING',
      openTasks: 8,
      range: null,
    });
  });

  it('still gives the date the work would end at without the new work that does not converge', () => {
    const tasks = [
      ...finishedIn('2026-10-05', '2026-10-12', '2026-10-19'),
      task('2026-10-06'),
      task('2026-10-13'),
      task('2026-10-20'),
      ...Array.from({ length: 5 }, () => task('2026-08-01')),
    ];

    const [recent] = paceOf(tasks, 4, NOW).forecast.windows;

    expect([recent.finishesBy, recent.finishesByIgnoringNewScope]).toEqual([
      null,
      '2026-12-23',
    ]);
  });

  it('says nothing was finished lately when no window has a completion', () => {
    const tasks = [
      task('2026-09-01'),
      task('2026-09-08', '2026-09-09'),
      task('2026-09-10'),
    ];

    const { forecast } = paceOf(tasks, 4, NOW);

    expect(forecast.status).toBe('NO_RECENT_COMPLETIONS');
    expect(forecast.range).toBeNull();
  });

  it('keeps the earliest and the latest date when the two windows differ', () => {
    // Three finished in the last complete week and none before: 1.5 a week over two weeks, 0.75 over four.
    const tasks = [
      task('2026-08-01', '2026-10-21'),
      task('2026-08-01', '2026-10-22'),
      task('2026-08-01', '2026-10-23'),
      ...Array.from({ length: 6 }, () => task('2026-08-01')),
    ];

    const { forecast } = paceOf(tasks, 4, NOW);

    expect(forecast.status).toBe('OK');
    expect(forecast.range).toEqual({ from: '2026-11-25', to: '2026-12-23' });
  });

  it('reads all the history of the project, not only the weeks the chart shows', () => {
    const tasks = [
      ...finishedIn('2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'),
      ...Array.from({ length: 4 }, () => task('2026-08-01')),
    ];

    const narrow = paceOf(tasks, 2, NOW).forecast;
    const wide = paceOf(tasks, 8, NOW).forecast;

    expect(narrow).toEqual(wide);
  });
});
