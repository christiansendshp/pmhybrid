import { PERMISSIONS, TaskStatus } from '@pmhybrid/shared-types';

/**
 * Kanban transition policy (brief §7, docs/domain-model.md). A code-level
 * table today, not admin-editable — same decoupling idiom as
 * ProjectRepositoryProvider so it can move to DB-driven config later
 * without touching callers.
 */
export interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  requiredPermission: string;
}

export const TASK_STATUS_TRANSITIONS: TransitionRule[] = [
  {
    from: TaskStatus.PENDIENTE,
    to: TaskStatus.ASIGNADA,
    requiredPermission: PERMISSIONS.TASK_ASSIGN,
  },
  {
    from: TaskStatus.ASIGNADA,
    to: TaskStatus.PENDIENTE,
    requiredPermission: PERMISSIONS.TASK_ASSIGN,
  },
  {
    from: TaskStatus.ASIGNADA,
    to: TaskStatus.EN_DESARROLLO,
    requiredPermission: PERMISSIONS.TASK_STATUS_TRANSITION,
  },
  {
    from: TaskStatus.EN_DESARROLLO,
    to: TaskStatus.QA,
    requiredPermission: PERMISSIONS.TASK_STATUS_TRANSITION,
  },
  {
    from: TaskStatus.EN_DESARROLLO,
    to: TaskStatus.ASIGNADA,
    requiredPermission: PERMISSIONS.TASK_STATUS_TRANSITION,
  },
  {
    from: TaskStatus.QA,
    to: TaskStatus.TERMINADA,
    requiredPermission: PERMISSIONS.TASK_QA_APPROVE,
  },
  {
    from: TaskStatus.QA,
    to: TaskStatus.EN_DESARROLLO,
    requiredPermission: PERMISSIONS.TASK_QA_REJECT,
  },
  {
    from: TaskStatus.TERMINADA,
    to: TaskStatus.EN_DESARROLLO,
    requiredPermission: PERMISSIONS.TASK_REOPEN,
  },
  {
    from: TaskStatus.TERMINADA,
    to: TaskStatus.QA,
    requiredPermission: PERMISSIONS.TASK_REOPEN,
  },
];

export function findTransitionRule(
  from: TaskStatus,
  to: TaskStatus,
): TransitionRule | undefined {
  return TASK_STATUS_TRANSITIONS.find(
    (rule) => rule.from === from && rule.to === to,
  );
}

/**
 * Hard rule (brief §7): once a task is EN_DESARROLLO, its assignee is
 * locked. Changing it needs `task.reassign.locked`, independent of the
 * transition table above (reassignment isn't a status transition at all).
 */
export const REASSIGN_LOCKED_PERMISSION = PERMISSIONS.TASK_REASSIGN_LOCKED;

export function isAssigneeLocked(status: TaskStatus): boolean {
  return status === TaskStatus.EN_DESARROLLO;
}

/**
 * The permission needed to put a task into `to` when it is in `from`, for a
 * change that does not come through the Kanban transition endpoint —
 * conflict resolution (Roadmap SECURITY-02) can move a task to whatever the
 * document says, including jumps the transition table has no rule for. A
 * legal single step keeps its rule's permission; a jump needs the strongest
 * key it crosses, so resolving a conflict can never do what the same person
 * could not do by moving the card themselves.
 */
export function permissionForStatusChange(
  from: TaskStatus,
  to: TaskStatus,
): string {
  const rule = findTransitionRule(from, to);
  if (rule) {
    return rule.requiredPermission;
  }
  if (to === TaskStatus.TERMINADA) {
    return PERMISSIONS.TASK_QA_APPROVE;
  }
  if (from === TaskStatus.TERMINADA) {
    return PERMISSIONS.TASK_REOPEN;
  }
  return PERMISSIONS.TASK_STATUS_TRANSITION;
}
