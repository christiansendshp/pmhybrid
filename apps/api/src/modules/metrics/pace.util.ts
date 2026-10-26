/** A task as the pace needs it: when it appeared, when it was finished (if it was), and its phase. */
export interface PaceTask {
  createdAt: Date;
  completedAt: Date | null;
  phaseId: string | null;
}

/** One week of the project (Monday to Sunday, UTC), with what happened in it and where the project stood at its end. */
export interface WeekPoint {
  /** The Monday that opens the week, as an ISO date (`2026-10-19`). */
  weekStart: string;
  /** Tasks finished during the week. */
  completed: number;
  /** Tasks that appeared during the week. */
  created: number;
  /** Tasks that existed at the end of the week (cumulative). */
  scope: number;
  /** Tasks finished by the end of the week (cumulative). */
  done: number;
  /** The week is the one in progress: its figures are those of so far. */
  partial: boolean;
}

export interface PhaseBurnUp {
  phaseId: string | null;
  weeks: { weekStart: string; scope: number; done: number }[];
}

/** What the pace of the last weeks says about when the open work ends (Roadmap TASK-35). */
export interface PaceWindow {
  /** How many complete weeks it averages. */
  weeks: number;
  completedPerWeek: number;
  createdPerWeek: number;
  /** When the open work ends at that pace with the new work that keeps arriving; null when it never does. */
  finishesBy: string | null;
  /** When it would end if no new work arrived at all. */
  finishesByIgnoringNewScope: string | null;
}

export type ForecastStatus =
  /** At least one window gives a date. */
  | 'OK'
  /** Fewer than two complete weeks of history: any date would be a guess. */
  | 'NOT_ENOUGH_HISTORY'
  /** Nothing is open. */
  | 'NOTHING_OPEN'
  /** New work arrives as fast as, or faster than, it closes. */
  | 'NOT_CONVERGING'
  /** Nothing was finished in the weeks the forecast reads: there is no pace to read. */
  | 'NO_RECENT_COMPLETIONS';

export interface Forecast {
  status: ForecastStatus;
  openTasks: number;
  windows: PaceWindow[];
  /** The earliest and the latest date the windows give, with new work counted; null without any. */
  range: { from: string; to: string } | null;
}

export interface Pace {
  weeks: WeekPoint[];
  byPhase: PhaseBurnUp[];
  forecast: Forecast;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** The paces the forecast reads, in complete weeks: the recent one and the steadier one. */
const WINDOWS = [2, 4] as const;

/** The Monday, at midnight UTC, of the week a moment is in: what `date_trunc('week', …)` gives on a UTC timestamp. */
export function weekStartOf(moment: Date): Date {
  const day = new Date(
    Date.UTC(
      moment.getUTCFullYear(),
      moment.getUTCMonth(),
      moment.getUTCDate(),
    ),
  );
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY);
}

const isoDate = (moment: Date) => moment.toISOString().slice(0, 10);

/**
 * The pace of a project (Roadmap TASK-35): for each of the last `weeks` weeks the tasks finished and the tasks
 * that appeared, where the scope and the done work stood at the end, the same by phase, and a forecast of when
 * the open work ends read as a range, always with the scope that keeps arriving beside it. Pure: the caller
 * gives the tasks (deleted ones out) and the moment it is read.
 *
 * The forecast is not a promise, and says so by declining: with fewer than two complete weeks of history it
 * gives no date, and when new work arrives as fast as it closes it says the work does not converge.
 */
export function paceOf(
  tasks: readonly PaceTask[],
  weeks: number,
  now: Date,
): Pace {
  const thisWeek = weekStartOf(now);
  const first = new Date(thisWeek.getTime() - (weeks - 1) * WEEK);
  const starts = Array.from(
    { length: weeks },
    (_, index) => new Date(first.getTime() + index * WEEK),
  );
  const endOf = (start: Date) => new Date(start.getTime() + WEEK);

  const inWeek = (moment: Date | null, start: Date) =>
    moment !== null &&
    moment.getTime() >= start.getTime() &&
    moment.getTime() < endOf(start).getTime();
  const upTo = (moment: Date | null, start: Date) =>
    moment !== null && moment.getTime() < endOf(start).getTime();

  const points: WeekPoint[] = starts.map((start) => ({
    weekStart: isoDate(start),
    completed: tasks.filter((task) => inWeek(task.completedAt, start)).length,
    created: tasks.filter((task) => inWeek(task.createdAt, start)).length,
    scope: tasks.filter((task) => upTo(task.createdAt, start)).length,
    done: tasks.filter((task) => upTo(task.completedAt, start)).length,
    partial: start.getTime() === thisWeek.getTime(),
  }));

  const phaseIds = [...new Set(tasks.map((task) => task.phaseId))];
  const byPhase: PhaseBurnUp[] = phaseIds
    .map((phaseId) => {
      const own = tasks.filter((task) => task.phaseId === phaseId);
      return {
        phaseId,
        weeks: starts.map((start) => ({
          weekStart: isoDate(start),
          scope: own.filter((task) => upTo(task.createdAt, start)).length,
          done: own.filter((task) => upTo(task.completedAt, start)).length,
        })),
      };
    })
    .sort((a, b) => (a.phaseId ?? '').localeCompare(b.phaseId ?? ''));

  return { weeks: points, byPhase, forecast: forecastOf(tasks, now) };
}

/** The forecast over all the history the tasks have, whatever the weeks the chart shows. */
function forecastOf(tasks: readonly PaceTask[], now: Date): Forecast {
  const open = tasks.filter((task) => task.completedAt === null).length;
  const thisWeek = weekStartOf(now);
  const earliest = tasks.reduce<number | null>((least, task) => {
    const first = Math.min(
      task.createdAt.getTime(),
      task.completedAt?.getTime() ?? Infinity,
    );
    return least === null || first < least ? first : least;
  }, null);
  // The complete weeks the project has lived: from the week of its first activity to the one before this.
  const completeWeeks =
    earliest === null
      ? 0
      : Math.max(
          0,
          Math.round(
            (thisWeek.getTime() - weekStartOf(new Date(earliest)).getTime()) /
              WEEK,
          ),
        );

  if (tasks.length === 0) {
    return {
      status: 'NOT_ENOUGH_HISTORY',
      openTasks: 0,
      windows: [],
      range: null,
    };
  }
  if (open === 0) {
    return { status: 'NOTHING_OPEN', openTasks: 0, windows: [], range: null };
  }
  if (completeWeeks < 2) {
    return {
      status: 'NOT_ENOUGH_HISTORY',
      openTasks: open,
      windows: [],
      range: null,
    };
  }

  const windows: PaceWindow[] = WINDOWS.map((size) => {
    const weeks = Math.min(size, completeWeeks);
    const from = new Date(thisWeek.getTime() - weeks * WEEK);
    const within = (moment: Date | null) =>
      moment !== null &&
      moment.getTime() >= from.getTime() &&
      moment.getTime() < thisWeek.getTime();
    const completedPerWeek =
      tasks.filter((task) => within(task.completedAt)).length / weeks;
    const createdPerWeek =
      tasks.filter((task) => within(task.createdAt)).length / weeks;
    const reach = (rate: number) =>
      rate > 0 ? isoDate(new Date(now.getTime() + (open / rate) * WEEK)) : null;
    return {
      weeks,
      completedPerWeek,
      createdPerWeek,
      finishesBy: reach(completedPerWeek - createdPerWeek),
      finishesByIgnoringNewScope: reach(completedPerWeek),
    };
  });

  if (windows.every((window) => window.completedPerWeek === 0)) {
    return {
      status: 'NO_RECENT_COMPLETIONS',
      openTasks: open,
      windows,
      range: null,
    };
  }
  const dates = windows.flatMap((window) =>
    window.finishesBy === null ? [] : [window.finishesBy],
  );
  if (dates.length === 0) {
    return { status: 'NOT_CONVERGING', openTasks: open, windows, range: null };
  }
  const sorted = [...dates].sort();
  return {
    status: 'OK',
    openTasks: open,
    windows,
    range: { from: sorted[0], to: sorted[sorted.length - 1] },
  };
}
