import type { Prisma } from '@prisma/client';
import { needsNormalization } from './word-count.util.js';

/** What of a task the title rules need. */
export interface TitledTask {
  title: string;
  originalTitle: string | null;
  description: string | null;
  generatedDescription: string | null;
}

/**
 * The title the document holds for a task (Roadmap GAP-39d): the one it was
 * read with when `title` has since been normalized, else `title` itself. Sync
 * compares the document's title against this, never against the normalized
 * one, and every write that puts the title back into a document writes this.
 */
export const sourceTitleOf = (
  task: Pick<TitledTask, 'title' | 'originalTitle'>,
): string => task.originalTitle ?? task.title;

/** No normalization state at all: the title is what it says. */
const CLEARED = {
  originalTitle: null,
  titleNormalization: null,
  titleNormalizationError: null,
  titleNormalizationAttempts: 0,
  titleNormalizedAt: null,
} as const;

/**
 * The columns to write when the task's title becomes `newTitle` because the
 * *document* says so (a new row, a changed title, a conflict settled for the
 * document's side): the normalization of the old title no longer applies, the
 * new one is queued when it is long, and a description the system wrote for
 * the old title goes with it — one a person wrote or edited stays.
 */
export function documentTitleData(
  task: Pick<TitledTask, 'description' | 'generatedDescription'>,
  newTitle: string,
): Prisma.TaskUncheckedUpdateInput {
  const descriptionIsGenerated =
    typeof task.generatedDescription === 'string' &&
    task.description === task.generatedDescription;
  return {
    title: newTitle,
    ...CLEARED,
    titleNormalization: needsNormalization(newTitle) ? 'PENDING' : null,
    ...(descriptionIsGenerated
      ? { description: null, generatedDescription: null }
      : {}),
  };
}

/** The columns to write when a *person* sets the title: it stands as written, long or not, and is never queued. */
export function personTitleData(
  newTitle: string,
): Prisma.TaskUncheckedUpdateInput {
  return { title: newTitle, ...CLEARED };
}
