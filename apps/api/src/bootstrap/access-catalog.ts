import type { PrismaClient } from '@prisma/client';
import { GLOBAL_PERMISSION_KEYS, PERMISSIONS } from '@pmhybrid/shared-types';

/**
 * What every installation of PM Hub starts with: the permissions the code
 * checks, the roles that carry them, and which permissions each role carries.
 * The demo seed and the production bootstrap (`bootstrap.ts`) both write this
 * and only this, so a real installation has the same access model as a laptop
 * (Roadmap IMPROVEMENT-02c).
 */

export const SYSTEM_ROLES = [
  'OWNER',
  'PROJECT_ADMIN',
  'PROJECT_MANAGER',
  'DEVELOPER',
  'QA',
  'VIEWER',
  'AI_AGENT',
] as const;
// Global-scope roles (brief §4 "rol global"), granted with ActorRole.projectId = null.
export const GLOBAL_ROLES = ['ADMIN'] as const;

export const PROJECT_PERMISSION_DEFS = [
  {
    key: PERMISSIONS.TASK_ASSIGN,
    description: 'Assign or unassign a task while not EN_DESARROLLO',
  },
  {
    key: PERMISSIONS.TASK_STATUS_TRANSITION,
    description: 'Move a task between ordinary Kanban states',
  },
  { key: PERMISSIONS.TASK_QA_APPROVE, description: 'Approve QA -> TERMINADA' },
  {
    key: PERMISSIONS.TASK_QA_REJECT,
    description: 'Reject QA -> EN_DESARROLLO',
  },
  { key: PERMISSIONS.TASK_REOPEN, description: 'Reopen a TERMINADA task' },
  {
    key: PERMISSIONS.TASK_REASSIGN_LOCKED,
    description: 'Reassign a task locked by EN_DESARROLLO',
  },
  {
    key: PERMISSIONS.TASK_DELETE,
    description: 'Remove a task (soft delete; its Roadmap row is taken out)',
  },
  {
    key: PERMISSIONS.TASK_WRITE,
    description: "Create and edit a task's fields and declare its dependencies",
  },
  { key: PERMISSIONS.CONFLICT_RESOLVE, description: 'Resolve a sync conflict' },
  { key: PERMISSIONS.PROJECT_UPDATE, description: 'Update project settings' },
  {
    key: PERMISSIONS.PROJECT_MEMBERS_MANAGE,
    description: 'Add or remove project members',
  },
  {
    key: PERMISSIONS.PROJECT_ROLES_MANAGE,
    description: 'Assign or revoke project-scoped roles',
  },
];
export const GLOBAL_PERMISSION_DEFS = [
  {
    key: PERMISSIONS.ACTORS_MANAGE,
    description: 'Create, edit and deactivate users and AI agents',
  },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    description: "Edit any role's permission set",
  },
];
export const PERMISSION_DEFS = [
  ...PROJECT_PERMISSION_DEFS,
  ...GLOBAL_PERMISSION_DEFS,
];

// Drift guard: GLOBAL_PERMISSION_DEFS above must exactly match the shared,
// authoritative GLOBAL_PERMISSION_KEYS list that RolesService.updateRolePermissions
// uses to refuse granting a global-only key to a project-scoped role.
{
  const declaredGlobal = new Set(GLOBAL_PERMISSION_DEFS.map((p) => p.key));
  const sharedGlobal = new Set(GLOBAL_PERMISSION_KEYS);
  const mismatch =
    declaredGlobal.size !== sharedGlobal.size ||
    [...declaredGlobal].some((key) => !sharedGlobal.has(key));
  if (mismatch) {
    throw new Error(
      'access-catalog.ts GLOBAL_PERMISSION_DEFS has drifted from shared-types GLOBAL_PERMISSION_KEYS',
    );
  }
}

export const GLOBAL_ROLE_PERMISSIONS: Record<
  (typeof GLOBAL_ROLES)[number],
  string[]
> = {
  ADMIN: GLOBAL_PERMISSION_DEFS.map((p) => p.key),
};

// Minimal default mapping (brief §4 leaves the exact matrix to the app).
// Project roles only ever carry project permissions — never a global one.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: PROJECT_PERMISSION_DEFS.map((p) => p.key),
  PROJECT_ADMIN: PROJECT_PERMISSION_DEFS.map((p) => p.key),
  PROJECT_MANAGER: [
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_STATUS_TRANSITION,
    PERMISSIONS.TASK_QA_APPROVE,
    PERMISSIONS.TASK_QA_REJECT,
    PERMISSIONS.TASK_REOPEN,
    PERMISSIONS.TASK_REASSIGN_LOCKED,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.CONFLICT_RESOLVE,
    PERMISSIONS.PROJECT_MEMBERS_MANAGE,
  ],
  DEVELOPER: [
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_STATUS_TRANSITION,
  ],
  QA: [
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_QA_APPROVE,
    PERMISSIONS.TASK_QA_REJECT,
  ],
  VIEWER: [],
  AI_AGENT: [
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_STATUS_TRANSITION,
  ],
};

export interface AccessCatalog {
  rolesByName: Map<string, { id: string }>;
  globalRolesByName: Map<string, { id: string }>;
}

/** Writes the permissions, the roles and their grants. Idempotent: it only ever adds, so a role an administrator has edited keeps what they gave it. */
export async function seedAccessCatalog(
  prisma: PrismaClient,
): Promise<AccessCatalog> {
  const permissionsByKey = new Map<string, { id: string }>();
  for (const def of PERMISSION_DEFS) {
    const permission = await prisma.permission.upsert({
      where: { key: def.key },
      update: { description: def.description },
      create: def,
    });
    permissionsByKey.set(def.key, permission);
  }

  async function seedRole(
    name: string,
    scope: 'GLOBAL' | 'PROJECT',
    permissionKeys: string[],
  ) {
    const role = await prisma.role.upsert({
      where: { name_scope: { name, scope } },
      update: {},
      create: { name, scope, isSystem: true },
    });
    for (const key of permissionKeys) {
      const permission = permissionsByKey.get(key)!;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    return role;
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const roleName of SYSTEM_ROLES) {
    rolesByName.set(
      roleName,
      await seedRole(roleName, 'PROJECT', ROLE_PERMISSIONS[roleName]),
    );
  }
  const globalRolesByName = new Map<string, { id: string }>();
  for (const roleName of GLOBAL_ROLES) {
    globalRolesByName.set(
      roleName,
      await seedRole(roleName, 'GLOBAL', GLOBAL_ROLE_PERMISSIONS[roleName]),
    );
  }
  return { rolesByName, globalRolesByName };
}
