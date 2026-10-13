import { TaskCard, TaskStatus } from './tasks.service.js';

/** How far a column, or an agent, is from an advisory limit on the work in progress (Roadmap TASK-15). */
export interface WipState {
  count: number;
  limit: number;
  /** More than the limit. At the limit is full, not exceeded. */
  exceeded: boolean;
}

/** The state against a limit; none when there is no limit, so nothing about it is shown. */
export function wipState(count: number, limit: number | null | undefined): WipState | null {
  return limit === null || limit === undefined ? null : { count, limit, exceeded: count > limit };
}

/** "4/3": how many, against how many. */
export function wipRatio(state: WipState): string {
  return `${state.count}/${state.limit}`;
}

/** How many tasks of the project are in a status, whatever the filters on the board: the real work in progress. */
export function countInStatus(cards: readonly TaskCard[], status: TaskStatus): number {
  return cards.filter((card) => card.status === status).length;
}

/**
 * How many tasks a person or an agent has in development: the work it has in progress. Development is
 * where a task is being worked; a task in QA waits for someone else.
 */
export function countAgentWip(cards: readonly TaskCard[], actorId: string): number {
  return cards.filter((card) => card.status === 'EN_DESARROLLO' && card.assignee?.id === actorId)
    .length;
}
