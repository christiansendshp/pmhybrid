import { TaskStatus } from '@pmhybrid/shared-types';

/**
 * What an Agentslog entry's status word says, in the vocabulary of the project-documentation
 * skill (Roadmap TASK-06). The words are free text in practice (`DONE (2 de 3 partes)`,
 * `IN_PROGRESS (revisión, 3 correcciones)`), so the canonical status is read from the start of
 * the word and the rest is kept as the qualifier. A word that starts with none of the known
 * ones has no canonical status, and nothing reads it differently from before.
 */
export type LedgerCanonicalStatus =
  | 'TODO'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'PAUSE'
  | 'DONE'
  /** A close of part of the work: not the terminal `DONE` of BR-003, which stays the exact word. */
  | 'DONE_PARTIAL';

export interface LedgerWord {
  canonicalStatus: LedgerCanonicalStatus | null;
  /** What follows the status word as written, without its parentheses or separator; null when there is nothing. */
  qualifier: string | null;
}

/** Longest first, so `QA REVIEW` is read as a whole and not as `QA`. Compared upper-cased with `_` as a space. */
const KNOWN_WORDS: readonly [
  string,
  Exclude<LedgerCanonicalStatus, 'DONE_PARTIAL'>,
][] = [
  ['IN PROGRESS', 'IN_PROGRESS'],
  ['QA REVIEW', 'REVIEW'],
  ['ASSIGNED', 'ASSIGNED'],
  ['TESTING', 'REVIEW'],
  ['REVIEW', 'REVIEW'],
  ['READY', 'ASSIGNED'],
  ['PAUSE', 'PAUSE'],
  ['DONE', 'DONE'],
  ['TODO', 'TODO'],
];

/** What may follow a status word: the end, a space, a bracket or a separator, never another letter. */
const BOUNDARY = /^[\s(—–:,;-]/;

/** A DONE that says it is a part: `parcial`, `partial`, `2 de 3 partes`, `chunk 1/2`. */
const PARTIAL =
  /\b(parcial|partial|partes?|chunk)\b|\b\d+\s*(\/|de|of)\s*\d+\b/i;

export function classifyLedgerWord(raw: string): LedgerWord {
  const text = raw.trim();
  const upper = text.toUpperCase().replace(/_/g, ' ');
  for (const [word, canonical] of KNOWN_WORDS) {
    if (!upper.startsWith(word)) {
      continue;
    }
    const rest = upper.slice(word.length);
    if (rest !== '' && !BOUNDARY.test(rest)) {
      continue;
    }
    const qualifier = qualifierOf(text.slice(word.length));
    return {
      canonicalStatus:
        canonical === 'DONE' && qualifier !== null && PARTIAL.test(qualifier)
          ? 'DONE_PARTIAL'
          : canonical,
      qualifier,
    };
  }
  return { canonicalStatus: null, qualifier: null };
}

function qualifierOf(rest: string): string | null {
  let text = rest.trim().replace(/^[—–:,;-]\s*/, '');
  const wrapped = /^\((.*)\)$/s.exec(text);
  if (wrapped) {
    text = wrapped[1];
  }
  text = text.trim();
  return text === '' ? null : text;
}

/** The result a `- Review: PASS - detail` line gives, or undefined for a missing or malformed one. */
export function reviewResultOf(
  value: string | undefined,
): 'PASS' | 'FAIL' | undefined {
  const match = /^\s*(PASS|FAIL)\b/i.exec(value ?? '');
  return match ? (match[1].toUpperCase() as 'PASS' | 'FAIL') : undefined;
}

/**
 * The Kanban stage an entry says its task is in, or null when it says nothing about the stage
 * (a pause, a close, a word the skill does not know). A review that failed is the developer's
 * again; a review that passed is still in QA until the task is closed.
 */
/**
 * The latest entry of each task in the ledger as the skill reads it: the last one written in the
 * hot ledger, else the last of the archive it was rotated into. Entries are in file order, which is
 * the order they happened; the agent's own clock is not used to order them.
 */
export function latestEntryByTask<
  T extends { taskExternalId: string; archived?: true },
>(entries: readonly T[]): Map<string, T> {
  const hot = new Map<string, T>();
  const archived = new Map<string, T>();
  for (const entry of entries) {
    (entry.archived ? archived : hot).set(entry.taskExternalId, entry);
  }
  return new Map([...archived, ...hot]);
}

/**
 * The stage the ledger gives a task whose Roadmap row only says `rowWord` (Roadmap TASK-07): the
 * row is coarse (`IN_PROGRESS` covers development and QA, `TODO` covers pending and assigned), the
 * ledger's latest entry says which. A row that says anything else, `DONE` included, is read as it
 * is read today, so this gives null and the ledger is never allowed to close or reopen a task.
 */
export function derivedStage(
  rowWord: 'TODO' | 'IN_PROGRESS' | 'DONE' | undefined,
  entry: { statusWord: string; review?: 'PASS' | 'FAIL' },
): TaskStatus | null {
  const stage = stageOfEntry(entry);
  if (rowWord === 'IN_PROGRESS') {
    return stage === TaskStatus.QA || stage === TaskStatus.EN_DESARROLLO
      ? stage
      : null;
  }
  if (rowWord === 'TODO') {
    return stage === TaskStatus.ASIGNADA ? stage : null;
  }
  return null;
}

/**
 * The stage the ledger's latest entry gives a task, to compare with the board (Roadmap TASK-14):
 * the stage of its word, or TERMINADA for the exact closing word. A partial close, a pause and a
 * word the skill does not know give nothing.
 */
export function ledgerStageOf(entry: {
  statusWord: string;
  review?: 'PASS' | 'FAIL';
}): TaskStatus | null {
  return classifyLedgerWord(entry.statusWord).canonicalStatus === 'DONE'
    ? TaskStatus.TERMINADA
    : stageOfEntry(entry);
}

export function stageOfEntry(entry: {
  statusWord: string;
  review?: 'PASS' | 'FAIL';
}): TaskStatus | null {
  switch (classifyLedgerWord(entry.statusWord).canonicalStatus) {
    case 'REVIEW':
      return entry.review === 'FAIL' ? TaskStatus.EN_DESARROLLO : TaskStatus.QA;
    case 'IN_PROGRESS':
      return TaskStatus.EN_DESARROLLO;
    case 'ASSIGNED':
      return TaskStatus.ASIGNADA;
    default:
      return null;
  }
}
