/** A task in the Roadmap's Blocked table, as the list needs it. */
export interface BlockedTask {
  id: string;
  externalId: string | null;
  title: string;
  blockedReason: string | null;
  neededDecision: string | null;
  /** When it entered the table (Roadmap TASK-31); the creation date stands in for a task that does not say. */
  blockedSince: Date | null;
  createdAt: Date;
  phaseId: string | null;
  epicId: string | null;
}

/** A task whose latest ledger entry says it waits on someone (`BLOQUEADO_PO`), whether or not its row is in the Blocked table. */
export interface LedgerBlock {
  taskId: string;
  externalId: string | null;
  title: string;
  /** Who it waits for, as the entry says it (`PO`), or null when it only says blocked. */
  from: string | null;
  /** The time the entry gives itself: the agent's clock, shown and not trusted for any decision. */
  since: Date;
}

export interface OpenConflict {
  id: string;
  kind: string;
  detectedAt: Date;
  task: { id: string; externalId: string | null; title: string } | null;
}

export type WaitingItem =
  | {
      kind: 'BLOCKED';
      since: Date;
      taskId: string;
      externalId: string | null;
      title: string;
      reason: string | null;
      neededDecision: string | null;
      /** Who the ledger says it waits for, when its latest entry says so. */
      from: string | null;
      /** How many unfinished tasks depend on it. */
      holds: number;
    }
  | {
      kind: 'DECISION';
      since: Date;
      taskId: string;
      externalId: string | null;
      title: string;
      from: string | null;
    }
  | {
      kind: 'CONFLICT';
      since: Date;
      conflictId: string;
      conflictKind: string;
      taskId: string | null;
      externalId: string | null;
      title: string | null;
    };

/** How many blocked tasks a phase or an epic has; `id` and `name` are null for the tasks that belong to none. */
export interface BlockedCount {
  id: string | null;
  name: string | null;
  blocked: number;
}

export interface Waiting {
  items: WaitingItem[];
  byPhase: BlockedCount[];
  byEpic: BlockedCount[];
}

export interface WaitingInput {
  blocked: readonly BlockedTask[];
  /** Unfinished tasks behind each task, by its id. */
  holds: ReadonlyMap<string, number>;
  ledgerBlocks: readonly LedgerBlock[];
  conflicts: readonly OpenConflict[];
  phases: readonly { id: string; name: string }[];
  epics: readonly { id: string; name: string }[];
}

const KIND_ORDER: Record<WaitingItem['kind'], number> = {
  BLOCKED: 0,
  DECISION: 1,
  CONFLICT: 2,
};

/**
 * What a project is waiting for, in one list, the longest waiting first (Roadmap TASK-32): the tasks in the
 * Blocked table, the tasks the ledger says wait on someone and are not in it, and the open conflicts.
 * A blocked task that the ledger also says waits on someone is one item, with the name of whom. Pure:
 * everything it needs is given, so what is listed is what the tests say.
 */
export function buildWaiting(input: WaitingInput): Waiting {
  const fromByTask = new Map(
    input.ledgerBlocks.map((block) => [block.taskId, block.from]),
  );
  const blockedIds = new Set(input.blocked.map((task) => task.id));

  const items: WaitingItem[] = [
    ...input.blocked.map((task): WaitingItem => ({
      kind: 'BLOCKED',
      since: task.blockedSince ?? task.createdAt,
      taskId: task.id,
      externalId: task.externalId,
      title: task.title,
      reason: task.blockedReason,
      neededDecision: task.neededDecision,
      from: fromByTask.get(task.id) ?? null,
      holds: input.holds.get(task.id) ?? 0,
    })),
    ...input.ledgerBlocks
      .filter((block) => !blockedIds.has(block.taskId))
      .map((block): WaitingItem => ({
        kind: 'DECISION',
        since: block.since,
        taskId: block.taskId,
        externalId: block.externalId,
        title: block.title,
        from: block.from,
      })),
    ...input.conflicts.map((conflict): WaitingItem => ({
      kind: 'CONFLICT',
      since: conflict.detectedAt,
      conflictId: conflict.id,
      conflictKind: conflict.kind,
      taskId: conflict.task?.id ?? null,
      externalId: conflict.task?.externalId ?? null,
      title: conflict.task?.title ?? null,
    })),
  ].sort(
    (a, b) =>
      a.since.getTime() - b.since.getTime() ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.title ?? '').localeCompare(b.title ?? ''),
  );

  return {
    items,
    byPhase: countBlocked(
      input.blocked.map((task) => task.phaseId),
      input.phases,
    ),
    byEpic: countBlocked(
      input.blocked.map((task) => task.epicId),
      input.epics,
    ),
  };
}

/** The blocked tasks counted by the group they belong to, the largest first; the ones in none are one group of their own. */
function countBlocked(
  groupIds: readonly (string | null)[],
  groups: readonly { id: string; name: string }[],
): BlockedCount[] {
  const names = new Map(groups.map((group) => [group.id, group.name]));
  const counts = new Map<string | null, number>();
  for (const id of groupIds) {
    const key = id !== null && names.has(id) ? id : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, blocked]) => ({
      id,
      name: id === null ? null : (names.get(id) ?? null),
      blocked,
    }))
    .sort(
      (a, b) =>
        b.blocked - a.blocked ||
        // The tasks in no group come after the named ones of the same size.
        Number(a.id === null) - Number(b.id === null) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
}
