import { KANBAN_STATUSES } from './task-status-policy.js';
import { StatusCounts } from './tasks.service.js';

export interface StatusCountEntry {
  status: string;
  count: number;
}

/**
 * Kanban-ordered breakdown of a progress node's `statusCounts` (brief §16
 * "conteos de progreso por estado") — every status listed, zero counts
 * included, so the UI can render a stable-width summary rather than one
 * that reshuffles as counts change.
 */
export function statusCountEntries(counts: StatusCounts): StatusCountEntry[] {
  return KANBAN_STATUSES.map((status) => ({ status, count: counts[status] }));
}

export function totalCount(counts: StatusCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
