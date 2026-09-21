/**
 * When a task was completed (the brief's task completion date, Roadmap
 * GAP-36d): set the moment its status becomes TERMINADA, cleared when it is
 * reopened, and otherwise left as it is. Every path that changes a task's
 * status derives its `completedAt` from here, so the date cannot drift from the
 * status whichever way the task got there — a transition in the app, a
 * conflict resolution, or a Roadmap row that was read or removed by sync.
 *
 * `undefined` means "do not touch the column".
 */
export function completedAtFor(
  previousStatus: string | null | undefined,
  nextStatus: string,
  now: Date = new Date(),
): Date | null | undefined {
  const wasDone = previousStatus === 'TERMINADA';
  const isDone = nextStatus === 'TERMINADA';
  if (isDone && !wasDone) {
    return now;
  }
  if (!isDone && wasDone) {
    return null;
  }
  return undefined;
}
