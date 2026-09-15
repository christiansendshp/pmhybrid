import { ProjectHierarchy } from './hierarchy.service.js';
import { TaskCard, TaskPriority, TaskStatus } from './tasks.service.js';

/** Brief §15 "agrupamiento": swimlanes across the five Kanban columns. */
export type BoardGroupBy = 'none' | 'assignee' | 'phase' | 'epic' | 'priority';

/** Brief §15 "ordenamiento", applied inside every column. */
export type BoardSortBy =
  'created' | 'priority' | 'dueDate' | 'progress' | 'updated' | 'externalId';

/** Filter value that selects tasks without an assignee. */
export const UNASSIGNED = '__unassigned__';

export interface BoardFilters {
  /** Matches the title or the Roadmap ID. */
  search: string;
  /** An actor id, `UNASSIGNED`, or null for everyone. */
  assigneeId: string | null;
  priority: TaskPriority | null;
  phaseId: string | null;
  epicId: string | null;
  blockedOnly: boolean;
}

export const NO_FILTERS: BoardFilters = {
  search: '',
  assigneeId: null,
  priority: null,
  phaseId: null,
  epicId: null,
  blockedOnly: false,
};

export interface BoardLane {
  key: string;
  label: string;
  count: number;
  columns: Record<TaskStatus, TaskCard[]>;
}

const NO_LANE = 'none';
const PRIORITY_RANK: Record<TaskPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Brief §15 "indicadores de bloqueo": blocked in the Roadmap, or waiting on unfinished work. */
export function isBlocked(card: TaskCard): boolean {
  return card.roadmapTable === 'BLOCKED' || card.dependencyCounts.open > 0;
}

export function filterCards(cards: TaskCard[], filters: BoardFilters): TaskCard[] {
  const search = filters.search.trim().toLowerCase();
  return cards.filter((card) => {
    if (
      search &&
      !card.title.toLowerCase().includes(search) &&
      !(card.externalId ?? '').toLowerCase().includes(search)
    ) {
      return false;
    }
    if (filters.assigneeId === UNASSIGNED ? card.assigneeActorId : false) {
      return false;
    }
    if (
      filters.assigneeId &&
      filters.assigneeId !== UNASSIGNED &&
      card.assigneeActorId !== filters.assigneeId
    ) {
      return false;
    }
    if (filters.priority && card.priority !== filters.priority) {
      return false;
    }
    if (filters.phaseId && card.phaseId !== filters.phaseId) {
      return false;
    }
    if (filters.epicId && card.epicId !== filters.epicId) {
      return false;
    }
    return !filters.blockedOnly || isBlocked(card);
  });
}

export function sortCards(cards: TaskCard[], sortBy: BoardSortBy): TaskCard[] {
  const byCreated = (a: TaskCard, b: TaskCard) => a.createdAt.localeCompare(b.createdAt);
  const comparators: Record<BoardSortBy, (a: TaskCard, b: TaskCard) => number> = {
    created: byCreated,
    priority: (a, b) => priorityRank(a) - priorityRank(b) || byCreated(a, b),
    dueDate: (a, b) => compareNullsLast(a.dueDate, b.dueDate) || byCreated(a, b),
    progress: (a, b) => a.computedProgress - b.computedProgress || byCreated(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    externalId: (a, b) => compareNullsLast(a.externalId, b.externalId) || byCreated(a, b),
  };
  return [...cards].sort(comparators[sortBy]);
}

/**
 * Splits already filtered and sorted cards into lanes, each with the five
 * status columns. Lanes follow a meaningful order (priority rank, the
 * project's phase and epic order, assignee name) with the "none" lane last;
 * card order inside a column is preserved.
 */
export function groupCards(
  cards: TaskCard[],
  groupBy: BoardGroupBy,
  hierarchy: ProjectHierarchy,
): BoardLane[] {
  if (groupBy === 'none') {
    return [toLane('all', 'All tasks', cards)];
  }

  const lanes = new Map<string, { label: string; cards: TaskCard[] }>();
  for (const card of cards) {
    const { key, label } = laneOf(card, groupBy, hierarchy);
    const lane = lanes.get(key) ?? { label, cards: [] };
    lane.cards.push(card);
    lanes.set(key, lane);
  }

  const rank = laneRank(groupBy, hierarchy);
  return [...lanes.entries()]
    .sort(([keyA, laneA], [keyB, laneB]) => {
      if (keyA === NO_LANE || keyB === NO_LANE) {
        return keyA === NO_LANE ? 1 : -1;
      }
      return rank(keyA) - rank(keyB) || laneA.label.localeCompare(laneB.label);
    })
    .map(([key, lane]) => toLane(key, lane.label, lane.cards));
}

function laneOf(
  card: TaskCard,
  groupBy: Exclude<BoardGroupBy, 'none'>,
  hierarchy: ProjectHierarchy,
): { key: string; label: string } {
  switch (groupBy) {
    case 'assignee':
      return card.assignee
        ? { key: card.assignee.id, label: card.assignee.displayName }
        : { key: NO_LANE, label: 'Unassigned' };
    case 'priority':
      return card.priority
        ? { key: card.priority, label: card.priority }
        : { key: NO_LANE, label: 'No priority' };
    case 'phase': {
      const phase = hierarchy.phases.find((candidate) => candidate.id === card.phaseId);
      return phase ? { key: phase.id, label: phase.name } : { key: NO_LANE, label: 'No phase' };
    }
    case 'epic': {
      const epic = hierarchy.epics.find((candidate) => candidate.id === card.epicId);
      return epic ? { key: epic.id, label: epic.name } : { key: NO_LANE, label: 'No epic' };
    }
  }
}

/** Lower sorts first; 0 for groupings ordered by label alone. */
function laneRank(groupBy: BoardGroupBy, hierarchy: ProjectHierarchy): (key: string) => number {
  switch (groupBy) {
    case 'priority':
      return (key) => PRIORITY_RANK[key as TaskPriority];
    case 'phase':
      return (key) => hierarchy.phases.find((phase) => phase.id === key)?.order ?? 0;
    case 'epic':
      return (key) => hierarchy.epics.find((epic) => epic.id === key)?.order ?? 0;
    default:
      return () => 0;
  }
}

function toLane(key: string, label: string, cards: TaskCard[]): BoardLane {
  const columns: Record<TaskStatus, TaskCard[]> = {
    PENDIENTE: [],
    ASIGNADA: [],
    EN_DESARROLLO: [],
    QA: [],
    TERMINADA: [],
  };
  for (const card of cards) {
    columns[card.status].push(card);
  }
  return { key, label, count: cards.length, columns };
}

function priorityRank(card: TaskCard): number {
  return card.priority ? PRIORITY_RANK[card.priority] : Object.keys(PRIORITY_RANK).length;
}

/** Natural order ("PMH-2" before "PMH-10"), missing values last. */
function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}
