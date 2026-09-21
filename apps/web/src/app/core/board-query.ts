import { Injectable } from '@angular/core';
import type { Params } from '@angular/router';
import { BoardFilters, BoardGroupBy, BoardSortBy, NO_FILTERS } from './board.js';
import { TASK_PRIORITIES, TaskPriority } from './tasks.service.js';

/** What the board shows and how: the filters, the grouping and the order. */
export interface BoardView {
  filters: BoardFilters;
  groupBy: BoardGroupBy;
  sortBy: BoardSortBy;
}

/** One shared value for "nothing", so a link that binds it does not see a new object on every check. */
const NO_PARAMS: Params = Object.freeze({});

export const DEFAULT_GROUP: BoardGroupBy = 'none';
export const DEFAULT_SORT: BoardSortBy = 'created';

const GROUPS: readonly BoardGroupBy[] = ['none', 'assignee', 'phase', 'epic', 'priority'];
const SORTS: readonly BoardSortBy[] = [
  'created',
  'priority',
  'dueDate',
  'progress',
  'updated',
  'externalId',
];

export const DEFAULT_VIEW: BoardView = {
  filters: NO_FILTERS,
  groupBy: DEFAULT_GROUP,
  sortBy: DEFAULT_SORT,
};

/**
 * The board's view as a query string (Roadmap UX-02b): only what differs from
 * the default, so an untouched board has a clean address and a filtered one can
 * be reloaded, shared, or come back to from a task.
 */
export function viewToParams(view: BoardView): Params {
  const { filters } = view;
  const params: Params = {};
  if (filters.search.trim() !== '') {
    params['q'] = filters.search;
  }
  if (filters.assigneeId) {
    params['assignee'] = filters.assigneeId;
  }
  if (filters.priority) {
    params['priority'] = filters.priority;
  }
  if (filters.phaseId) {
    params['phase'] = filters.phaseId;
  }
  if (filters.epicId) {
    params['epic'] = filters.epicId;
  }
  if (filters.blockedOnly) {
    params['blocked'] = '1';
  }
  if (view.groupBy !== DEFAULT_GROUP) {
    params['group'] = view.groupBy;
  }
  if (view.sortBy !== DEFAULT_SORT) {
    params['sort'] = view.sortBy;
  }
  return params;
}

/** The view a query string names; a value that is not one the board knows is left at its default. */
export function paramsToView(get: (key: string) => string | null): BoardView {
  const priority = get('priority');
  const group = get('group');
  const sort = get('sort');
  return {
    filters: {
      search: get('q') ?? '',
      assigneeId: get('assignee') || null,
      priority: TASK_PRIORITIES.includes(priority as TaskPriority)
        ? (priority as TaskPriority)
        : null,
      phaseId: get('phase') || null,
      epicId: get('epic') || null,
      blockedOnly: get('blocked') === '1',
    },
    groupBy: GROUPS.includes(group as BoardGroupBy) ? (group as BoardGroupBy) : DEFAULT_GROUP,
    sortBy: SORTS.includes(sort as BoardSortBy) ? (sort as BoardSortBy) : DEFAULT_SORT,
  };
}

/** Whether two queries say the same, whatever order their keys are in. */
export function sameParams(a: Params, b: Params): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => String(a[key] ?? '') === String(b[key] ?? ''));
}

/** Whether a query string says anything about the board. */
export function hasBoardParams(params: Params): boolean {
  return Object.keys(params).length > 0;
}

/**
 * What each project's board looked like when it was left, for the length of the
 * session. A link back to the board that carries no query (a breadcrumb, the
 * tab) then finds the filters where they were left, instead of an unfiltered
 * board that looks as if the filter had been lost (Roadmap UX-02b).
 */
@Injectable({ providedIn: 'root' })
export class BoardMemory {
  private readonly byProject = new Map<string, Params>();

  remember(projectId: string, params: Params): void {
    if (hasBoardParams(params)) {
      this.byProject.set(projectId, params);
    } else {
      this.byProject.delete(projectId);
    }
  }

  /** The query the project's board was left with; empty when it was unfiltered. */
  recall(projectId: string): Params {
    return this.byProject.get(projectId) ?? NO_PARAMS;
  }
}
