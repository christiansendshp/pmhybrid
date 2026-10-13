import type { TaskTableSort } from './dto/list-task-table-query.dto.js';

/** What the table orders by, per task: only what the comparator reads. */
export interface TaskSortRow {
  id: string;
  externalId: string | null;
  title: string;
  status: string;
  priority: string | null;
  statusChangedAt: Date;
  dueDate: Date | null;
  updatedAt: Date;
  createdAt: Date;
  assignee: { displayName: string } | null;
  reviewer: { displayName: string } | null;
}

const STATUS_RANK: Record<string, number> = {
  PENDIENTE: 0,
  ASIGNADA: 1,
  EN_DESARROLLO: 2,
  QA: 3,
  TERMINADA: 4,
};

/** Most urgent first when ascending. */
const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

type Key = string | number | null;

/** The value a column sorts by; null for a task that has none, which goes last in either direction. */
function keyOf(row: TaskSortRow, sort: TaskTableSort): Key {
  switch (sort) {
    case 'externalId':
      return row.externalId;
    case 'title':
      return row.title;
    case 'status':
      return STATUS_RANK[row.status] ?? null;
    case 'assignee':
      return row.assignee?.displayName ?? null;
    case 'reviewer':
      return row.reviewer?.displayName ?? null;
    case 'priority':
      return row.priority === null
        ? null
        : (PRIORITY_RANK[row.priority] ?? null);
    case 'age':
      // Ascending is the shortest time in the stage first, so the newest change comes first.
      return -row.statusChangedAt.getTime();
    case 'dueDate':
      return row.dueDate?.getTime() ?? null;
    case 'updatedAt':
      return row.updatedAt.getTime();
    case 'createdAt':
      return row.createdAt.getTime();
  }
}

const collator = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

function compareKeys(a: Key, b: Key): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return collator.compare(String(a), String(b));
}

/**
 * The order of the table of tasks (Roadmap TASK-18): by the column, then by creation time and id so the
 * order is total and the same on every page. A task with no value for the column goes last whichever
 * way it is ordered, and the text is read the way a person does ("PMH-2" before "PMH-10", no case).
 */
export function sortTaskRows<T extends TaskSortRow>(
  rows: readonly T[],
  sort: TaskTableSort,
  dir: 'asc' | 'desc',
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = keyOf(a, sort);
    const right = keyOf(b, sort);
    if (left === null || right === null) {
      if (left !== right) {
        return left === null ? 1 : -1;
      }
    } else {
      const byColumn = compareKeys(left, right) * sign;
      if (byColumn !== 0) {
        return byColumn;
      }
    }
    return (
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
}
