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
