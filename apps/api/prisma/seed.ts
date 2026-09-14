import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demo-credentials.js';

const prisma = new PrismaClient();

const SYSTEM_ROLES = ['OWNER', 'PROJECT_ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA', 'VIEWER', 'AI_AGENT'] as const;

const PERMISSION_DEFS = [
  { key: PERMISSIONS.TASK_ASSIGN, description: 'Assign or unassign a task while not EN_DESARROLLO' },
  { key: PERMISSIONS.TASK_STATUS_TRANSITION, description: 'Move a task between ordinary Kanban states' },
  { key: PERMISSIONS.TASK_QA_APPROVE, description: 'Approve QA -> TERMINADA' },
  { key: PERMISSIONS.TASK_QA_REJECT, description: 'Reject QA -> EN_DESARROLLO' },
  { key: PERMISSIONS.TASK_REOPEN, description: 'Reopen a TERMINADA task' },
  { key: PERMISSIONS.TASK_REASSIGN_LOCKED, description: 'Reassign a task locked by EN_DESARROLLO' },
  { key: PERMISSIONS.PROJECT_UPDATE, description: 'Update project settings' },
  { key: PERMISSIONS.PROJECT_MEMBERS_MANAGE, description: 'Add or remove project members' },
  { key: PERMISSIONS.PROJECT_ROLES_MANAGE, description: 'Assign or revoke project-scoped roles' },
];

// Minimal default mapping (brief §4 leaves the exact matrix to the app).
const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: PERMISSION_DEFS.map((p) => p.key),
  PROJECT_ADMIN: PERMISSION_DEFS.map((p) => p.key),
  PROJECT_MANAGER: [
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_STATUS_TRANSITION,
    PERMISSIONS.TASK_QA_APPROVE,
    PERMISSIONS.TASK_QA_REJECT,
    PERMISSIONS.TASK_REOPEN,
    PERMISSIONS.TASK_REASSIGN_LOCKED,
    PERMISSIONS.PROJECT_MEMBERS_MANAGE,
  ],
  DEVELOPER: [PERMISSIONS.TASK_ASSIGN, PERMISSIONS.TASK_STATUS_TRANSITION],
  QA: [PERMISSIONS.TASK_QA_APPROVE, PERMISSIONS.TASK_QA_REJECT],
  VIEWER: [],
  AI_AGENT: [PERMISSIONS.TASK_ASSIGN, PERMISSIONS.TASK_STATUS_TRANSITION],
};

async function main() {
  const permissionsByKey = new Map<string, { id: string }>();
  for (const def of PERMISSION_DEFS) {
    const permission = await prisma.permission.upsert({
      where: { key: def.key },
      update: { description: def.description },
      create: def,
    });
    permissionsByKey.set(def.key, permission);
  }

  for (const roleName of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name_scope: { name: roleName, scope: 'PROJECT' } },
      update: {},
      create: { name: roleName, scope: 'PROJECT', isSystem: true },
    });

    for (const key of ROLE_PERMISSIONS[roleName]) {
      const permission = permissionsByKey.get(key)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const demoProject = await prisma.project.upsert({
    where: { id: 'demo-project' },
    update: {},
    create: {
      id: 'demo-project',
      name: 'PM Hub Demo',
      description: 'Seed project for local development (full §32 dataset lands in FASE-12).',
      docsPath: './demo-project-docs',
    },
  });

  const humanActor = await prisma.actor.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      kind: 'HUMAN',
      displayName: 'Demo Human',
      email: DEMO_EMAIL,
    },
  });

  // Local-dev-only demo password, not a real secret — documented in README.md.
  const demoPasswordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  await prisma.userCredential.upsert({
    where: { actorId: humanActor.id },
    update: { passwordHash: demoPasswordHash },
    create: { actorId: humanActor.id, authProvider: 'LOCAL', passwordHash: demoPasswordHash },
  });

  const agentActor = await prisma.actor.upsert({
    where: { email: 'demo-agent@pmhybrid.local' },
    update: {},
    create: {
      kind: 'AI_AGENT',
      displayName: 'Demo Agent',
      email: 'demo-agent@pmhybrid.local',
      agentProfile: { create: { providerType: 'custom' } },
    },
  });

  await prisma.projectMember.upsert({
    where: { projectId_actorId: { projectId: demoProject.id, actorId: humanActor.id } },
    update: {},
    create: { projectId: demoProject.id, actorId: humanActor.id },
  });
  await prisma.projectMember.upsert({
    where: { projectId_actorId: { projectId: demoProject.id, actorId: agentActor.id } },
    update: {},
    create: { projectId: demoProject.id, actorId: agentActor.id },
  });

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { name_scope: { name: 'OWNER', scope: 'PROJECT' } },
  });
  const agentRole = await prisma.role.findUniqueOrThrow({
    where: { name_scope: { name: 'AI_AGENT', scope: 'PROJECT' } },
  });

  await prisma.actorRole.upsert({
    where: { actorId_roleId_projectId: { actorId: humanActor.id, roleId: ownerRole.id, projectId: demoProject.id } },
    update: {},
    create: { actorId: humanActor.id, roleId: ownerRole.id, projectId: demoProject.id },
  });
  await prisma.actorRole.upsert({
    where: { actorId_roleId_projectId: { actorId: agentActor.id, roleId: agentRole.id, projectId: demoProject.id } },
    update: {},
    create: { actorId: agentActor.id, roleId: agentRole.id, projectId: demoProject.id },
  });

  console.log('Seed complete:', {
    project: demoProject.name,
    actors: [humanActor.displayName, agentActor.displayName],
    roles: SYSTEM_ROLES.length,
    permissions: PERMISSION_DEFS.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
