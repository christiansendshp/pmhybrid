/**
 * Permission keys referenced by the Kanban transition policy
 * (docs/domain-model.md) and by project/RBAC management (FASE-05). Kept as
 * string constants, not an enum, so a new permission can be added without a
 * breaking change to consumers.
 */
export const PERMISSIONS = {
  TASK_ASSIGN: 'task.assign',
  TASK_STATUS_TRANSITION: 'task.status.transition',
  TASK_QA_APPROVE: 'task.qa.approve',
  TASK_QA_REJECT: 'task.qa.reject',
  TASK_REOPEN: 'task.reopen',
  TASK_REASSIGN_LOCKED: 'task.reassign.locked',
  TASK_DELETE: 'task.delete',
  PROJECT_UPDATE: 'project.update',
  PROJECT_MEMBERS_MANAGE: 'project.members.manage',
  PROJECT_ROLES_MANAGE: 'project.roles.manage',
  /** Global-scope only (granted via a GLOBAL role, never a project role): create, edit, deactivate users and AI agents. */
  ACTORS_MANAGE: 'actors.manage',
  /** Global-scope only: edit any role's permission set (the catalog itself, not a project's assignments). */
  ROLES_MANAGE: 'roles.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * The keys granted only via a GLOBAL role (projectId-null ActorRole grant) —
 * everything else is PROJECT-scope. Single source of truth for the seed's
 * two permission-def arrays and for RolesService.updateRolePermissions,
 * which must never let a PROJECT-scope role carry one of these: granted
 * only through project-scoped ActorRole rows, it could never actually be
 * resolved (PermissionGuard checks global ∪ that project's grants only), so
 * the role would silently hold power it can never exercise.
 */
export const GLOBAL_PERMISSION_KEYS: readonly PermissionKey[] = [
  PERMISSIONS.ACTORS_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
];
