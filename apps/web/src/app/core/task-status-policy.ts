import { TaskStatus } from './tasks.service.js';

export const KANBAN_STATUSES: TaskStatus[] = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_DESARROLLO',
  'QA',
  'TERMINADA',
];

/** Kanban status values are already Spanish domain terms (ADR-002, written verbatim into the Roadmap); only the separator changes for display. */
export function statusLabel(status: string): string {
  return status.replace('_', ' ');
}

/**
 * Mirrors apps/api/src/modules/tasks/task-status-policy.ts — which
 * transitions are legal, for showing/allowing the right controls. The
 * server re-validates and is the actual source of truth.
 */
export const LEGAL_NEXT_STATUSES: Record<TaskStatus, TaskStatus[]> = {
  PENDIENTE: ['ASIGNADA'],
  ASIGNADA: ['PENDIENTE', 'EN_DESARROLLO'],
  EN_DESARROLLO: ['QA', 'ASIGNADA'],
  QA: ['TERMINADA', 'EN_DESARROLLO'],
  TERMINADA: ['EN_DESARROLLO', 'QA'],
};

/**
 * Kanban board drag targets (FASE-09 scope): PENDIENTE and ASIGNADA are not
 * drop targets — PENDIENTE<-ASIGNADA means "unassign" and
 * PENDIENTE->ASIGNADA needs an assignee picked, both better done as a
 * deliberate action in Task Detail than an implicit drag. Every other
 * legal transition (moving work forward through the board, QA
 * rejection, reopening a done task) is draggable.
 */
export function isDraggableTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (to === 'PENDIENTE' || to === 'ASIGNADA') {
    return false;
  }
  return LEGAL_NEXT_STATUSES[from].includes(to);
}
