/** How many work tasks of a phase there are, and how many of them are not done (Roadmap TASK-41). */
export interface PhaseTally {
  total: number;
  open: number;
}

/** What the tasks of the project say about each phase: the phases with no work task are not in the answer. */
export function tallyPhases(
  groups: readonly { phaseId: string | null; status: string; count: number }[],
): Map<string, PhaseTally> {
  const tallies = new Map<string, PhaseTally>();
  for (const { phaseId, status, count } of groups) {
    if (phaseId === null) {
      continue;
    }
    const tally = tallies.get(phaseId) ?? { total: 0, open: 0 };
    tally.total += count;
    if (status !== 'TERMINADA') {
      tally.open += count;
    }
    tallies.set(phaseId, tally);
  }
  return tallies;
}

/** A phase is complete when it has work and none of it is open: a phase with no tasks never completes. */
export const isComplete = (tally: PhaseTally | undefined): boolean =>
  tally !== undefined && tally.total > 0 && tally.open === 0;

/** What to do about one phase: announce it, forget it was announced, or nothing. */
export type PhaseVerdict = 'ANNOUNCE' | 'REOPEN' | 'NONE';

/**
 * The marker keeps an announcement from repeating: a complete phase that was not announced is announced; one that
 * was announced and has an open task again is reopened (so finishing it again is announced again).
 */
export function phaseVerdict(
  tally: PhaseTally | undefined,
  announced: boolean,
): PhaseVerdict {
  if (isComplete(tally)) {
    return announced ? 'NONE' : 'ANNOUNCE';
  }
  return announced ? 'REOPEN' : 'NONE';
}
