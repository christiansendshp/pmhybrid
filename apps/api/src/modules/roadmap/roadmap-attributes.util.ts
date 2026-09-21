import { TaskPriority } from '@pmhybrid/shared-types';

/**
 * What a Roadmap entry says about a task besides its text and state: its type,
 * priority and progress (Roadmap GAP-35c). Only the YAML entries of the
 * project-documentation schema carry them; the tables have no such column.
 */

/**
 * The schema's priorities (`P0` the most urgent) against the app's four levels.
 * One to one, so a value survives the round trip; the lossy part is only that
 * a document may use words the app has no level for, which are then ignored
 * rather than guessed at.
 */
const FROM_DOCUMENT: Record<string, TaskPriority> = {
  P0: TaskPriority.CRITICAL,
  P1: TaskPriority.HIGH,
  P2: TaskPriority.MEDIUM,
  P3: TaskPriority.LOW,
  CRITICAL: TaskPriority.CRITICAL,
  HIGH: TaskPriority.HIGH,
  MEDIUM: TaskPriority.MEDIUM,
  LOW: TaskPriority.LOW,
};

const TO_DOCUMENT: Record<TaskPriority, string> = {
  [TaskPriority.CRITICAL]: 'P0',
  [TaskPriority.HIGH]: 'P1',
  [TaskPriority.MEDIUM]: 'P2',
  [TaskPriority.LOW]: 'P3',
};

/** The app's priority for a document's `priority` value, or undefined when it is absent or not one it knows. */
export function priorityFromDocument(raw: unknown): TaskPriority | undefined {
  return typeof raw === 'string'
    ? FROM_DOCUMENT[raw.trim().toUpperCase()]
    : undefined;
}

/**
 * The value to write for a priority: the document's own notation. A document
 * that spells its priorities as words keeps them; anything else gets P0-P3,
 * the schema's.
 */
export function priorityToDocument(
  priority: TaskPriority,
  existing?: unknown,
): string {
  const usesWords =
    typeof existing === 'string' &&
    /^(CRITICAL|HIGH|MEDIUM|LOW)$/i.test(existing.trim());
  return usesWords ? priority : TO_DOCUMENT[priority];
}

/** A `progress` value that is a whole percent (0-100), a number or a numeric string; anything else is not imported. */
export function progressFromDocument(raw: unknown): number | undefined {
  const value =
    typeof raw === 'string' && /^\s*\d+\s*%?\s*$/.test(raw)
      ? Number.parseInt(raw, 10)
      : raw;
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : undefined;
}

/** The entry's `type`, upper-cased, or undefined when it has none. */
export function entryTypeFromDocument(raw: unknown): string | undefined {
  const type = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return type === '' ? undefined : type;
}

/**
 * Entry types that are not work to be done (references/roadmap-schema.md §2):
 * the levels above a task, which a phase, an epic or the project stands for,
 * and the entries that coordinate work — a choice to make, an obstacle, an
 * outside dependency. They stay visible as cards, but they are not a share of
 * the project's progress: an undecided DECISION is not a task that is 0% done.
 */
export const NON_WORK_ENTRY_TYPES: readonly string[] = [
  'VISION',
  'PHASE',
  'THEME',
  'EPIC',
  'DECISION',
  'BLOCKER',
  'DEPENDENCY',
];
