/**
 * When a task entered its state (Roadmap TASK-11): the columns to write
 * alongside a new status, so `Task.statusChangedAt` cannot drift from the status
 * whichever way the task got there — a move in the app, an assignment that
 * promotes it, a conflict settled, a member's removal, or a Roadmap row read or
 * removed by sync. Nothing to write when the status did not change.
 */
export function statusStamp(
  previousStatus: string | null | undefined,
  nextStatus: string,
  now: Date = new Date(),
): {
  statusChangedAt?: Date;
  reviewerActorId?: null;
  reviewRequestedAt?: null;
} {
  if (previousStatus === nextStatus) {
    return {};
  }
  // A reviewer was asked for the time the task was in QA (Roadmap SUBTASK-09.1): whichever way
  // the task leaves it, the request is over.
  return {
    statusChangedAt: now,
    ...(previousStatus === 'QA'
      ? { reviewerActorId: null, reviewRequestedAt: null }
      : {}),
  };
}
