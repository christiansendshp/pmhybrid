import { TaskCard } from './tasks.service.js';

/** The tasks waiting for one reviewer, or for nobody in particular. */
export interface ReviewGroup {
  /** The reviewer's actor id, or `none` for the tasks nobody was asked to review. */
  key: string;
  label: string;
  /** The queue of the person looking at it. */
  mine: boolean;
  /** Oldest first: the one that has waited longest is at the top. */
  cards: TaskCard[];
}

export const NO_REVIEWER = 'none';

/**
 * The tasks in QA as a queue per reviewer (Roadmap TASK-19). A reviewer sees their own queue first; then the
 * tasks nobody was asked to review, which need someone, then the other reviewers by name. Inside every
 * group the task that has been in QA longest comes first.
 */
export function reviewGroups(cards: readonly TaskCard[], myActorId: string | null): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const card of cards) {
    if (card.status !== 'QA') {
      continue;
    }
    const key = card.reviewer?.id ?? NO_REVIEWER;
    const group = groups.get(key) ?? {
      key,
      label: card.reviewer?.displayName ?? 'Sin revisor',
      mine: key !== NO_REVIEWER && key === myActorId,
      cards: [],
    };
    group.cards.push(card);
    groups.set(key, group);
  }
  const rank = (group: ReviewGroup) => (group.mine ? 0 : group.key === NO_REVIEWER ? 1 : 2);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      cards: [...group.cards].sort(
        (a, b) =>
          new Date(a.statusChangedAt).getTime() - new Date(b.statusChangedAt).getTime() ||
          a.createdAt.localeCompare(b.createdAt),
      ),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
