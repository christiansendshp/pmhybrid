import { TaskStatus } from '@pmhybrid/shared-types';

/**
 * The workflow states the latest project-documentation skill allows in every
 * Status cell of Roadmap.md (PAUSE is a state a row is *in*, never one PM Hub
 * picks for a task, so it is not here).
 */
export type WorkflowStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

const KANBAN_TO_WORKFLOW: Record<string, WorkflowStatus> = {
  [TaskStatus.PENDIENTE]: 'TODO',
  [TaskStatus.ASIGNADA]: 'TODO',
  [TaskStatus.EN_DESARROLLO]: 'IN_PROGRESS',
  [TaskStatus.QA]: 'IN_PROGRESS',
  [TaskStatus.TERMINADA]: 'DONE',
};

const WORKFLOW_TOKENS: Record<string, WorkflowStatus> = {
  TODO: 'TODO',
  'IN PROGRESS': 'IN_PROGRESS',
  DONE: 'DONE',
};

function normalize(raw: string): string {
  return raw.trim().toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

/** The skill's word for a Kanban state (or a workflow word, which is its own). Throws for anything else rather than writing a cell the skill's check rejects. */
export function workflowStatusFor(status: string): WorkflowStatus {
  const workflow =
    WORKFLOW_TOKENS[normalize(status)] ??
    KANBAN_TO_WORKFLOW[normalize(status).replace(/ /g, '_')];
  if (!workflow) {
    throw new Error(`No workflow status for "${status}"`);
  }
  return workflow;
}

/** Whether a Status cell already says PAUSE. */
export function isPauseCell(raw: string | undefined): boolean {
  return raw !== undefined && normalize(raw) === 'PAUSE';
}

/**
 * Whether a row's status differs from the task's. The skill's vocabulary is
 * coarser than the board (TODO covers PENDIENTE and ASIGNADA, IN_PROGRESS
 * covers EN_DESARROLLO and QA), so when the document says one of its own
 * words and the task's column projects to it, nothing changed: reading back
 * what PM Hub wrote must not move a QA card to EN_DESARROLLO.
 */
export function rowStatusDiffers(
  row: { statusRaw?: string; statusMapped?: TaskStatus | null },
  taskStatus: string,
): boolean {
  if (!row.statusMapped) {
    return false;
  }
  if (row.statusMapped === taskStatus) {
    return false;
  }
  const spoken = row.statusRaw
    ? WORKFLOW_TOKENS[normalize(row.statusRaw)]
    : undefined;
  return !(spoken && KANBAN_TO_WORKFLOW[taskStatus] === spoken);
}
