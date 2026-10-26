/** What the database gives of a ledger entry to know the work it is about (Roadmap TASK-33). */
export interface UntrackedEvent {
  taskExternalId: string;
  agentName: string;
  statusWord: string;
  canonicalStatus: string | null;
  timestampFromLog: Date;
  /** When PM Hub read it: breaks a tie between two entries of the same time. */
  createdAt: Date;
}

/** An ID the ledger works on that is no task of the project, with what the ledger says of it. */
export interface UntrackedWork {
  externalId: string;
  entries: number;
  /** The agents that wrote an entry of it, as the ledger names them, in alphabetical order. */
  agents: string[];
  firstSeen: Date;
  lastSeen: Date;
  /** The status word of its latest entry, as written. */
  lastWord: string;
  /** Whether its latest entry is the exact `DONE`, the only word that closes work (BR-003). */
  closed: boolean;
}

/**
 * The work the ledger carries that is no task of the project: one row for each ID with entries and no task,
 * the open ones first (they are the ones that need a look), then the most recent (Roadmap TASK-33). The
 * latest entry is the one with the latest time it says, then the one read last: the entries of the archive
 * are no longer in the file, so the file order cannot be used here. Pure: the caller gives the entries and
 * the IDs that are tasks.
 */
export function untrackedWork(
  events: readonly UntrackedEvent[],
  taskExternalIds: ReadonlySet<string>,
): UntrackedWork[] {
  const byId = new Map<string, UntrackedEvent[]>();
  for (const event of events) {
    if (taskExternalIds.has(event.taskExternalId)) {
      continue;
    }
    const group = byId.get(event.taskExternalId) ?? [];
    group.push(event);
    byId.set(event.taskExternalId, group);
  }
  return [...byId]
    .map(([externalId, group]) => {
      const ordered = [...group].sort(
        (a, b) =>
          a.timestampFromLog.getTime() - b.timestampFromLog.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const last = ordered[ordered.length - 1];
      return {
        externalId,
        entries: group.length,
        agents: [...new Set(group.map((event) => event.agentName))].sort(
          (a, b) => a.localeCompare(b),
        ),
        firstSeen: ordered[0].timestampFromLog,
        lastSeen: last.timestampFromLog,
        lastWord: last.statusWord,
        closed: last.statusWord === 'DONE',
      };
    })
    .sort(
      (a, b) =>
        Number(a.closed) - Number(b.closed) ||
        b.lastSeen.getTime() - a.lastSeen.getTime() ||
        a.externalId.localeCompare(b.externalId),
    );
}
