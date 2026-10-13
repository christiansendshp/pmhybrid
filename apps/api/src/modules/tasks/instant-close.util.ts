/**
 * A task whose first IN_PROGRESS and its DONE are minutes apart was documented after the fact
 * (Roadmap TASK-12): the board could not show it in development. A signal about the record, not
 * an accusation: closing a batch afterwards is legitimate, it only means the work was not visible.
 */

/** The project setting's default and its ceiling (a day), in minutes. */
export const DEFAULT_INSTANT_CLOSE_MINUTES = 5;
export const MAX_INSTANT_CLOSE_MINUTES = 1440;

/** What the Agentslog says about one task's life: its first start and its last close. */
export interface TaskLifeSpan {
  startedAt: Date | null;
  doneAt: Date | null;
}

/** The span of a task that was started and then closed, or null while it lacks either (or the close is before the start). */
export function closedSpan(
  span: TaskLifeSpan,
): { startedAt: Date; doneAt: Date } | null {
  if (!span.startedAt || !span.doneAt || span.doneAt < span.startedAt) {
    return null;
  }
  return { startedAt: span.startedAt, doneAt: span.doneAt };
}

/** Closed less than `thresholdMinutes` after it was started. */
export function isInstantClose(
  span: TaskLifeSpan,
  thresholdMinutes: number,
): boolean {
  const closed = closedSpan(span);
  return (
    closed !== null &&
    closed.doneAt.getTime() - closed.startedAt.getTime() <
      thresholdMinutes * 60_000
  );
}

export interface InstantCloseMetrics {
  /** The project's setting the figures were computed with. */
  thresholdMinutes: number;
  /** Tasks the ledger shows started and then closed. */
  closedTasks: number;
  /** Of those, the ones closed under the threshold. */
  instantCloses: number;
  /** `instantCloses / closedTasks`, 4 decimals; null while no task is closed. */
  share: number | null;
}

export function instantCloseMetrics(
  spans: Iterable<TaskLifeSpan>,
  thresholdMinutes: number,
): InstantCloseMetrics {
  let closedTasks = 0;
  let instantCloses = 0;
  for (const span of spans) {
    if (closedSpan(span)) {
      closedTasks += 1;
      if (isInstantClose(span, thresholdMinutes)) {
        instantCloses += 1;
      }
    }
  }
  return {
    thresholdMinutes,
    closedTasks,
    instantCloses,
    share:
      closedTasks === 0
        ? null
        : Math.round((instantCloses / closedTasks) * 10_000) / 10_000,
  };
}
