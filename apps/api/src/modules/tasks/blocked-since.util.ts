/**
 * Since when a task is blocked (Roadmap TASK-31): `Task.blockedSince` is the time the task entered the
 * Roadmap's Blocked table, so the list of what is waiting can say how long. Like `statusStamp` it is
 * the columns to write alongside a new table, so the two cannot drift whichever way the table changed
 * (a sync reading a row, a row that left, a conflict settled). A task that stays in the table, or
 * stays out of it, has nothing to write.
 */
export function blockedStamp(
  previousTable: string | null | undefined,
  nextTable: string | null | undefined,
  now: Date = new Date(),
): { blockedSince?: Date | null } {
  const was = previousTable === 'BLOCKED';
  const is = nextTable === 'BLOCKED';
  if (is && !was) {
    return { blockedSince: now };
  }
  if (was && !is) {
    return { blockedSince: null };
  }
  return {};
}
