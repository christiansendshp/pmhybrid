/** The statuses a task can be in, in the order of the Kanban (Roadmap TASK-46). */
export const SNAPSHOT_STATUSES = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_DESARROLLO',
  'QA',
  'TERMINADA',
] as const;

export type StatusCounts = Record<(typeof SNAPSHOT_STATUSES)[number], number>;

/** What a project's tasks add up to: all of them, the done ones, and how many are in each status. */
export interface Tally {
  total: number;
  done: number;
  byStatus: StatusCounts;
}

/** The counts of a project from its tasks grouped by status: every status is there, with 0 when it has none. */
export function tallyStatuses(
  groups: readonly { status: string; count: number }[],
): Tally {
  const byStatus: StatusCounts = {
    PENDIENTE: 0,
    ASIGNADA: 0,
    EN_DESARROLLO: 0,
    QA: 0,
    TERMINADA: 0,
  };
  for (const { status, count } of groups) {
    if (status in byStatus) {
      byStatus[status as keyof StatusCounts] += count;
    }
  }
  const total = SNAPSHOT_STATUSES.reduce(
    (sum, status) => sum + byStatus[status],
    0,
  );
  return { total, done: byStatus.TERMINADA, byStatus };
}

/** A UTC day as the `YYYY-MM-DD` the API and the history speak. */
export const dayKey = (day: Date): string => day.toISOString().slice(0, 10);

const DAY = 24 * 60 * 60 * 1000;

/** The dates of a task, which is all that is left of its past (Roadmap TASK-47). */
export interface DatedTask {
  createdAt: Date;
  completedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * The total and the done tasks of a project at the end of a UTC day, from the tasks' dates alone (Roadmap TASK-47):
 * a task counts from the day it was created until the day it was deleted, and is done once its `completedAt` has
 * passed. It is approximate on purpose: a task that was finished and later reopened has lost its `completedAt`, so
 * it counts as open on days it was done, and nothing else about that day (the count by status, what was blocked, the
 * conflicts, the progress) can be known.
 */
export function totalsAtEndOf(
  tasks: readonly DatedTask[],
  day: Date,
): { total: number; done: number } {
  const end = day.getTime() + DAY;
  let total = 0;
  let done = 0;
  for (const task of tasks) {
    const existed = task.createdAt.getTime() < end;
    const gone = task.deletedAt !== null && task.deletedAt.getTime() < end;
    if (!existed || gone) {
      continue;
    }
    total += 1;
    if (task.completedAt !== null && task.completedAt.getTime() < end) {
      done += 1;
    }
  }
  return { total, done };
}

/**
 * The days to rebuild: the `days` days before today (today is the job's), without the ones that already have a
 * snapshot and without the ones before the project existed. Oldest first; `today` and `existing` are UTC days.
 */
export function daysToReconstruct(
  today: Date,
  days: number,
  existing: ReadonlySet<string>,
  projectCreatedAt: Date,
): Date[] {
  const firstDay = Math.floor(projectCreatedAt.getTime() / DAY) * DAY;
  const wanted: Date[] = [];
  for (let back = days; back >= 1; back -= 1) {
    const day = new Date(today.getTime() - back * DAY);
    if (day.getTime() >= firstDay && !existing.has(dayKey(day))) {
      wanted.push(day);
    }
  }
  return wanted;
}
