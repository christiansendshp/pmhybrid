/** One distinct status word of a project's ledger and what it means to PM Hub (Roadmap TASK-30). */
export interface LedgerWordRow {
  /** The word as the agents wrote it. */
  word: string;
  /** What it maps to, or null for an entry stored before the sync classified it. */
  canonicalStatus: string | null;
  /** How many entries carry it. */
  entries: number;
  /** One qualifier that followed it, as an example, or null when none did. */
  qualifier: string | null;
}

/** What the database gives for each distinct word: the word, its status, how many and an example qualifier. */
export interface LedgerWordGroup {
  statusWord: string;
  canonicalStatus: string | null;
  _count: { _all: number };
  _max: { statusQualifier: string | null };
}

/**
 * The words of a ledger as a list a person can act on: the ones the table does not know (`OTHER`)
 * first, because those are the ones to teach it, then the most used (Roadmap TASK-30). An entry not
 * yet classified comes right after them, since the next sync will give it a status.
 */
export function ledgerWordRows(
  groups: readonly LedgerWordGroup[],
): LedgerWordRow[] {
  const rank = (status: string | null) =>
    status === 'OTHER' ? 0 : status === null ? 1 : 2;
  return groups
    .map((group) => ({
      word: group.statusWord,
      canonicalStatus: group.canonicalStatus,
      entries: group._count._all,
      qualifier: group._max.statusQualifier,
    }))
    .sort(
      (a, b) =>
        rank(a.canonicalStatus) - rank(b.canonicalStatus) ||
        b.entries - a.entries ||
        a.word.localeCompare(b.word),
    );
}
