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

/** What a change to a task's Roadmap table did to whether it is blocked. */
export type BlockedMove = 'BLOCKED' | 'UNBLOCKED';

const tableOf = (value: unknown): string | null => {
  const table = (value as { roadmapTable?: unknown } | null | undefined)
    ?.roadmapTable;
  return typeof table === 'string' ? table : null;
};

/**
 * Whether an audit event of a table change (`previousValue` and `newValue`) put a task into the Blocked table or took
 * it out for another one (Roadmap TASK-40). A row that vanished (no table) is neither, and neither is a change that
 * completed the task: it is done, not unblocked. One rule for the notifications and for the Panel's news.
 */
export function blockedMove(
  previousValue: unknown,
  newValue: unknown,
): BlockedMove | null {
  if (
    (newValue as { status?: unknown } | null | undefined)?.status ===
    'TERMINADA'
  ) {
    return null;
  }
  const previous = tableOf(previousValue);
  const next = tableOf(newValue);
  if (next === 'BLOCKED' && previous !== 'BLOCKED') {
    return 'BLOCKED';
  }
  if (previous === 'BLOCKED' && next !== null && next !== 'BLOCKED') {
    return 'UNBLOCKED';
  }
  return null;
}

interface TableChange {
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
}

/**
 * What a run of table changes did to each task, net: from where its first change started to where its last one
 * ended, so a task put into the Blocked table and taken out again within one run is news to nobody. The changes
 * come oldest first; a task that did not end up blocked or unblocked is not in the answer.
 */
export function netBlockedMoves(
  changes: readonly TableChange[],
): Map<string, BlockedMove> {
  const firstPrevious = new Map<string, unknown>();
  const lastNew = new Map<string, unknown>();
  for (const change of changes) {
    if (!firstPrevious.has(change.entityId)) {
      firstPrevious.set(change.entityId, change.previousValue);
    }
    lastNew.set(change.entityId, change.newValue);
  }
  const moves = new Map<string, BlockedMove>();
  for (const [taskId, previous] of firstPrevious) {
    const move = blockedMove(previous, lastNew.get(taskId));
    if (move) {
      moves.set(taskId, move);
    }
  }
  return moves;
}
