import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, TaskStatus, RoadmapTable } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demo-credentials.js';

const prisma = new PrismaClient();

const SYSTEM_ROLES = ['OWNER', 'PROJECT_ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA', 'VIEWER', 'AI_AGENT'] as const;
// Global-scope roles (brief §4 "rol global"), granted with ActorRole.projectId = null.
const GLOBAL_ROLES = ['ADMIN'] as const;

const PROJECT_PERMISSION_DEFS = [
  { key: PERMISSIONS.TASK_ASSIGN, description: 'Assign or unassign a task while not EN_DESARROLLO' },
  { key: PERMISSIONS.TASK_STATUS_TRANSITION, description: 'Move a task between ordinary Kanban states' },
  { key: PERMISSIONS.TASK_QA_APPROVE, description: 'Approve QA -> TERMINADA' },
  { key: PERMISSIONS.TASK_QA_REJECT, description: 'Reject QA -> EN_DESARROLLO' },
  { key: PERMISSIONS.TASK_REOPEN, description: 'Reopen a TERMINADA task' },
  { key: PERMISSIONS.TASK_REASSIGN_LOCKED, description: 'Reassign a task locked by EN_DESARROLLO' },
  { key: PERMISSIONS.TASK_DELETE, description: 'Remove a task (soft delete; its Roadmap row is taken out)' },
  { key: PERMISSIONS.PROJECT_UPDATE, description: 'Update project settings' },
  { key: PERMISSIONS.PROJECT_MEMBERS_MANAGE, description: 'Add or remove project members' },
  { key: PERMISSIONS.PROJECT_ROLES_MANAGE, description: 'Assign or revoke project-scoped roles' },
];
const GLOBAL_PERMISSION_DEFS = [
  { key: PERMISSIONS.ACTORS_MANAGE, description: 'Create, edit and deactivate users and AI agents' },
];
const PERMISSION_DEFS = [...PROJECT_PERMISSION_DEFS, ...GLOBAL_PERMISSION_DEFS];

const GLOBAL_ROLE_PERMISSIONS: Record<(typeof GLOBAL_ROLES)[number], string[]> = {
  ADMIN: GLOBAL_PERMISSION_DEFS.map((p) => p.key),
};

// Minimal default mapping (brief §4 leaves the exact matrix to the app).
// Project roles only ever carry project permissions — never a global one.
const ROLE_PERMISSIONS: Record<string, string[]> = {
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
    PERMISSIONS.PROJECT_MEMBERS_MANAGE,
  ],
  DEVELOPER: [PERMISSIONS.TASK_ASSIGN, PERMISSIONS.TASK_STATUS_TRANSITION],
  QA: [PERMISSIONS.TASK_QA_APPROVE, PERMISSIONS.TASK_QA_REJECT],
  VIEWER: [],
  AI_AGENT: [PERMISSIONS.TASK_ASSIGN, PERMISSIONS.TASK_STATUS_TRANSITION],
};

interface DemoActor {
  key: string;
  displayName: string;
  email: string;
  kind: 'HUMAN' | 'AI_AGENT';
  projectRole: (typeof SYSTEM_ROLES)[number];
}

interface DemoTaskDef {
  id: string;
  externalId?: string; // absent => not a Roadmap row (e.g. a subtask)
  title: string;
  status: TaskStatus;
  table?: 'ACTIVE' | 'NEAR_TERM' | 'BLOCKED';
  phaseKey?: string;
  epicKey?: string;
  parentId?: string;
  assigneeKey?: string;
  progressPercent?: number;
  acceptanceCriteria?: string;
  dependsOn?: string[]; // DemoTaskDef.id values
  blockedReason?: string;
  neededDecision?: string;
  logTimestamp: string; // ISO, used for both Agentslog entries and AI owner-cell stamp
}

interface DemoPhaseDef {
  key: string;
  name: string;
  order: number;
}

interface DemoEpicDef {
  key: string;
  name: string;
  order: number;
  phaseKey?: string;
}

interface DemoProjectDef {
  id: string;
  name: string;
  description: string;
  docsDirName: string;
  actors: DemoActor[];
  phases: DemoPhaseDef[];
  epics: DemoEpicDef[];
  tasks: DemoTaskDef[];
}

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

  async function seedRole(name: string, scope: 'GLOBAL' | 'PROJECT', permissionKeys: string[]) {
    const role = await prisma.role.upsert({
      where: { name_scope: { name, scope } },
      update: {},
      create: { name, scope, isSystem: true },
    });
    for (const key of permissionKeys) {
      const permission = permissionsByKey.get(key)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    return role;
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const roleName of SYSTEM_ROLES) {
    rolesByName.set(roleName, await seedRole(roleName, 'PROJECT', ROLE_PERMISSIONS[roleName]));
  }
  const globalRolesByName = new Map<string, { id: string }>();
  for (const roleName of GLOBAL_ROLES) {
    globalRolesByName.set(roleName, await seedRole(roleName, 'GLOBAL', GLOBAL_ROLE_PERMISSIONS[roleName]));
  }

  const humanActor = await prisma.actor.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { kind: 'HUMAN', displayName: 'Demo Human', email: DEMO_EMAIL },
  });

  // Local-dev-only demo password, not a real secret — documented in README.md.
  const demoPasswordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  await prisma.userCredential.upsert({
    where: { actorId: humanActor.id },
    update: { passwordHash: demoPasswordHash },
    create: { actorId: humanActor.id, authProvider: 'LOCAL', passwordHash: demoPasswordHash },
  });

  // The demo login administers the instance (global ADMIN) — on a fresh
  // database it is the only actor able to create further users and agents.
  // Global grants can't use the compound-unique upsert (projectId is NULL),
  // hence find-then-create; the partial index still rejects duplicates.
  const adminRole = globalRolesByName.get('ADMIN')!;
  const adminGrant = await prisma.actorRole.findFirst({
    where: { actorId: humanActor.id, roleId: adminRole.id, projectId: null },
  });
  if (!adminGrant) {
    await prisma.actorRole.create({ data: { actorId: humanActor.id, roleId: adminRole.id } });
  }

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

  // §32 wants more than one human and more than one agent represented
  // across the demo data — a second human (project-manager-flavored) and a
  // second agent (developer-flavored), distinct from the two above which
  // stay the login/API-driven demo identities used by the e2e suite.
  const anaActor = await prisma.actor.upsert({
    where: { email: 'ana@pmhybrid.local' },
    update: {},
    create: { kind: 'HUMAN', displayName: 'Ana García', email: 'ana@pmhybrid.local' },
  });
  const anaPasswordHash = await argon2.hash('anagarcia1234', { type: argon2.argon2id });
  await prisma.userCredential.upsert({
    where: { actorId: anaActor.id },
    update: { passwordHash: anaPasswordHash },
    create: { actorId: anaActor.id, authProvider: 'LOCAL', passwordHash: anaPasswordHash },
  });

  const codexActor = await prisma.actor.upsert({
    where: { email: 'codex@pmhybrid.local' },
    update: {},
    create: {
      kind: 'AI_AGENT',
      displayName: 'Codex',
      email: 'codex@pmhybrid.local',
      agentProfile: { create: { providerType: 'custom' } },
    },
  });

  const ownerRole = rolesByName.get('OWNER')!;
  const agentRole = rolesByName.get('AI_AGENT')!;

  async function addOwnerAndAgent(projectId: string) {
    await prisma.projectMember.upsert({
      where: { projectId_actorId: { projectId, actorId: humanActor.id } },
      update: {},
      create: { projectId, actorId: humanActor.id },
    });
    await prisma.projectMember.upsert({
      where: { projectId_actorId: { projectId, actorId: agentActor.id } },
      update: {},
      create: { projectId, actorId: agentActor.id },
    });
    await prisma.actorRole.upsert({
      where: { actorId_roleId_projectId: { actorId: humanActor.id, roleId: ownerRole.id, projectId } },
      update: {},
      create: { actorId: humanActor.id, roleId: ownerRole.id, projectId },
    });
    await prisma.actorRole.upsert({
      where: { actorId_roleId_projectId: { actorId: agentActor.id, roleId: agentRole.id, projectId } },
      update: {},
      create: { actorId: agentActor.id, roleId: agentRole.id, projectId },
    });
  }

  // Points at PMHYBRID's OWN docs/ (this repo is itself managed by the
  // project-documentation skill — see Step 0 in the approved plan). Gives
  // FASE-06's structured/documental views real content to render against
  // instead of only synthetic seed data.
  const selfDocsPath = path.resolve(fileURLToPath(import.meta.url), '../../../../docs');
  const selfProject = await prisma.project.upsert({
    where: { id: 'pmhybrid-self' },
    update: { docsPath: selfDocsPath },
    create: {
      id: 'pmhybrid-self',
      name: 'PM Hub (this repo)',
      description: "This project's own docs/, managed by the project-documentation skill.",
      docsPath: selfDocsPath,
    },
  });
  await addOwnerAndAgent(selfProject.id);

  // --- §32 demo dataset: 2 additional projects with rich hierarchy -------
  const demoActors: DemoActor[] = [
    { key: 'human', displayName: humanActor.displayName, email: humanActor.email!, kind: 'HUMAN', projectRole: 'OWNER' },
    { key: 'ana', displayName: anaActor.displayName, email: anaActor.email!, kind: 'HUMAN', projectRole: 'PROJECT_MANAGER' },
    { key: 'agent', displayName: agentActor.displayName, email: agentActor.email!, kind: 'AI_AGENT', projectRole: 'AI_AGENT' },
    { key: 'codex', displayName: codexActor.displayName, email: codexActor.email!, kind: 'AI_AGENT', projectRole: 'AI_AGENT' },
  ];
  const actorRecordByKey = new Map<string, { id: string }>([
    ['human', humanActor],
    ['ana', anaActor],
    ['agent', agentActor],
    ['codex', codexActor],
  ]);

  const websiteRelaunch: DemoProjectDef = {
    id: 'demo-website-relaunch',
    name: 'Website Relaunch',
    description: 'Marketing site rebuild — demo dataset (brief §32): human-led, one AI collaborator.',
    docsDirName: 'website-relaunch',
    actors: demoActors,
    phases: [
      { key: 'discovery', name: 'Discovery', order: 1 },
      { key: 'build', name: 'Build', order: 2 },
      { key: 'launch', name: 'Launch', order: 3 },
    ],
    epics: [
      { key: 'design-system', name: 'Design System', order: 1, phaseKey: 'build' },
      { key: 'content-migration', name: 'Content Migration', order: 2, phaseKey: 'build' },
    ],
    tasks: [
      {
        id: 'wr-1',
        externalId: 'WR-1',
        title: 'Kickoff workshop',
        status: TaskStatus.TERMINADA,
        table: 'ACTIVE',
        phaseKey: 'discovery',
        assigneeKey: 'ana',
        progressPercent: 100,
        acceptanceCriteria: 'Stakeholders signed off on goals and scope',
        logTimestamp: '2026-08-10T09:00:00.000Z',
      },
      {
        id: 'wr-2',
        externalId: 'WR-2',
        title: 'Define sitemap',
        status: TaskStatus.TERMINADA,
        table: 'ACTIVE',
        phaseKey: 'discovery',
        assigneeKey: 'human',
        progressPercent: 100,
        acceptanceCriteria: 'Sitemap approved by product owner',
        dependsOn: ['wr-1'],
        logTimestamp: '2026-08-14T11:00:00.000Z',
      },
      {
        id: 'wr-3',
        externalId: 'WR-3',
        title: 'Build design system',
        status: TaskStatus.EN_DESARROLLO,
        table: 'ACTIVE',
        phaseKey: 'build',
        epicKey: 'design-system',
        assigneeKey: 'codex',
        dependsOn: ['wr-2'],
        acceptanceCriteria: 'Tokens and components documented in Storybook',
        logTimestamp: '2026-08-25T10:00:00.000Z',
      },
      {
        id: 'wr-3a',
        title: 'Color tokens',
        status: TaskStatus.TERMINADA,
        parentId: 'wr-3',
        assigneeKey: 'codex',
        progressPercent: 100,
        logTimestamp: '2026-08-27T10:00:00.000Z',
      },
      {
        id: 'wr-3b',
        title: 'Typography scale',
        status: TaskStatus.EN_DESARROLLO,
        parentId: 'wr-3',
        assigneeKey: 'codex',
        progressPercent: 40,
        logTimestamp: '2026-09-02T10:00:00.000Z',
      },
      {
        id: 'wr-4',
        externalId: 'WR-4',
        title: 'Migrate blog content',
        status: TaskStatus.ASIGNADA,
        table: 'NEAR_TERM',
        phaseKey: 'build',
        epicKey: 'content-migration',
        assigneeKey: 'ana',
        progressPercent: 0,
        dependsOn: ['wr-3'],
        acceptanceCriteria: 'All posts migrated with working redirects',
        logTimestamp: '2026-09-05T09:00:00.000Z',
      },
      {
        id: 'wr-5',
        externalId: 'WR-5',
        title: 'Legal review of new copy',
        status: TaskStatus.PENDIENTE,
        table: 'BLOCKED',
        phaseKey: 'build',
        blockedReason: 'Esperando aprobación legal del equipo de marketing',
        neededDecision: '¿Se puede usar el texto de marketing actual sin revisión adicional?',
        logTimestamp: '2026-09-06T09:00:00.000Z',
      },
      {
        id: 'wr-6',
        externalId: 'WR-6',
        title: 'Launch checklist',
        status: TaskStatus.PENDIENTE,
        table: 'NEAR_TERM',
        phaseKey: 'launch',
        assigneeKey: 'human',
        progressPercent: 0,
        dependsOn: ['wr-4'],
        acceptanceCriteria: 'All launch checklist items verified',
        logTimestamp: '2026-09-07T09:00:00.000Z',
      },
    ],
  };

  const mobileApp: DemoProjectDef = {
    id: 'demo-mobile-app',
    name: 'Mobile App Revamp',
    description: 'Native app rebuild — demo dataset (brief §32): AI-agent-heavy, one blocked task.',
    docsDirName: 'mobile-app',
    actors: demoActors,
    phases: [
      { key: 'planning', name: 'Planning', order: 1 },
      { key: 'development', name: 'Development', order: 2 },
    ],
    epics: [
      { key: 'auth', name: 'Auth Module', order: 1, phaseKey: 'development' },
      { key: 'payments', name: 'Payments', order: 2, phaseKey: 'development' },
    ],
    tasks: [
      {
        id: 'ma-1',
        externalId: 'MA-1',
        title: 'Define API contracts',
        status: TaskStatus.TERMINADA,
        table: 'ACTIVE',
        phaseKey: 'planning',
        assigneeKey: 'human',
        progressPercent: 100,
        acceptanceCriteria: 'OpenAPI spec reviewed and merged',
        logTimestamp: '2026-08-18T09:00:00.000Z',
      },
      {
        id: 'ma-2',
        externalId: 'MA-2',
        title: 'Implement auth flow',
        status: TaskStatus.EN_DESARROLLO,
        table: 'ACTIVE',
        phaseKey: 'development',
        epicKey: 'auth',
        assigneeKey: 'agent',
        progressPercent: 70,
        dependsOn: ['ma-1'],
        acceptanceCriteria: 'Login/refresh/logout covered by e2e tests',
        logTimestamp: '2026-08-29T09:00:00.000Z',
      },
      {
        id: 'ma-3',
        externalId: 'MA-3',
        title: 'Implement payments',
        status: TaskStatus.QA,
        table: 'ACTIVE',
        phaseKey: 'development',
        epicKey: 'payments',
        assigneeKey: 'codex',
        progressPercent: 90,
        dependsOn: ['ma-1'],
        acceptanceCriteria: 'Checkout flow passes QA sign-off',
        logTimestamp: '2026-09-04T09:00:00.000Z',
      },
      {
        id: 'ma-3a',
        title: 'Write payments tests',
        status: TaskStatus.TERMINADA,
        parentId: 'ma-3',
        assigneeKey: 'codex',
        progressPercent: 100,
        logTimestamp: '2026-09-05T09:00:00.000Z',
      },
      {
        id: 'ma-4',
        externalId: 'MA-4',
        title: 'Security audit',
        status: TaskStatus.PENDIENTE,
        table: 'BLOCKED',
        phaseKey: 'development',
        dependsOn: ['ma-2', 'ma-3'],
        blockedReason: 'Falta presupuesto aprobado para auditoría externa',
        neededDecision: '¿Se aprueba el gasto de auditoría de seguridad este trimestre?',
        logTimestamp: '2026-09-08T09:00:00.000Z',
      },
    ],
  };

  for (const def of [websiteRelaunch, mobileApp]) {
    await seedDemoProject(def, actorRecordByKey, rolesByName);
  }

  console.log('Seed complete:', {
    projects: [selfProject.name, websiteRelaunch.name, mobileApp.name],
    actors: [humanActor.displayName, agentActor.displayName, anaActor.displayName, codexActor.displayName],
    roles: SYSTEM_ROLES.length + GLOBAL_ROLES.length,
    permissions: PERMISSION_DEFS.length,
  });
}

async function seedDemoProject(
  def: DemoProjectDef,
  actorRecordByKey: Map<string, { id: string }>,
  rolesByName: Map<string, { id: string }>,
) {
  const docsPath = path.resolve(fileURLToPath(import.meta.url), '..', 'demo-projects', def.docsDirName);
  mkdirSync(docsPath, { recursive: true });

  const project = await prisma.project.upsert({
    where: { id: def.id },
    update: { name: def.name, description: def.description, docsPath },
    create: { id: def.id, name: def.name, description: def.description, docsPath },
  });

  for (const actor of def.actors) {
    const record = actorRecordByKey.get(actor.key)!;
    await prisma.projectMember.upsert({
      where: { projectId_actorId: { projectId: project.id, actorId: record.id } },
      update: {},
      create: { projectId: project.id, actorId: record.id },
    });
    const role = rolesByName.get(actor.projectRole)!;
    await prisma.actorRole.upsert({
      where: { actorId_roleId_projectId: { actorId: record.id, roleId: role.id, projectId: project.id } },
      update: {},
      create: { actorId: record.id, roleId: role.id, projectId: project.id },
    });
  }

  const phaseIdByKey = new Map<string, string>();
  for (const phase of def.phases) {
    const id = `${project.id}-phase-${phase.key}`;
    await prisma.phase.upsert({
      where: { id },
      update: { name: phase.name, order: phase.order },
      create: { id, projectId: project.id, name: phase.name, order: phase.order },
    });
    phaseIdByKey.set(phase.key, id);
  }

  const epicIdByKey = new Map<string, string>();
  for (const epic of def.epics) {
    const id = `${project.id}-epic-${epic.key}`;
    await prisma.epic.upsert({
      where: { id },
      update: { name: epic.name, order: epic.order, phaseId: epic.phaseKey ? phaseIdByKey.get(epic.phaseKey) : null },
      create: {
        id,
        projectId: project.id,
        name: epic.name,
        order: epic.order,
        phaseId: epic.phaseKey ? phaseIdByKey.get(epic.phaseKey) : null,
      },
    });
    epicIdByKey.set(epic.key, id);
  }

  const taskIdByKey = new Map<string, string>();
  for (const task of def.tasks) {
    taskIdByKey.set(task.id, `${project.id}-task-${task.id}`);
  }

  // Parents/dependencies are always defined earlier in def.tasks, so a
  // single forward pass resolves every taskIdByKey lookup below.
  for (const task of def.tasks) {
    const id = taskIdByKey.get(task.id)!;
    const assigneeActorId = task.assigneeKey ? actorRecordByKey.get(task.assigneeKey)!.id : null;
    const data = {
      externalId: task.externalId ?? null,
      title: task.title,
      status: task.status,
      phaseId: task.phaseKey ? phaseIdByKey.get(task.phaseKey) : null,
      epicId: task.epicKey ? epicIdByKey.get(task.epicKey) : null,
      parentTaskId: task.parentId ? taskIdByKey.get(task.parentId) : null,
      assigneeActorId,
      assigneeLockedAt: task.status === TaskStatus.EN_DESARROLLO && assigneeActorId ? new Date(task.logTimestamp) : null,
      progressPercent: task.progressPercent ?? null,
      acceptanceCriteria: task.acceptanceCriteria ?? null,
      roadmapTable: task.table ? (RoadmapTable[task.table] as RoadmapTable) : null,
      blockedReason: task.blockedReason ?? null,
      neededDecision: task.neededDecision ?? null,
      sourceOrigin: 'UI' as const,
    };
    await prisma.task.upsert({
      where: { id },
      update: data,
      create: { id, projectId: project.id, ...data },
    });

    if (assigneeActorId) {
      const assignmentId = `${id}-assignment`;
      await prisma.taskAssignment.upsert({
        where: { id: assignmentId },
        update: {},
        create: {
          id: assignmentId,
          taskId: id,
          actorId: assigneeActorId,
          assignedByActorId: actorRecordByKey.get('human')!.id,
          assignedAt: new Date(task.logTimestamp),
        },
      });
    }

    for (const depKey of task.dependsOn ?? []) {
      const dependsOnTaskId = taskIdByKey.get(depKey)!;
      const dependencyId = `${id}-dep-${depKey}`;
      await prisma.taskDependency.upsert({
        where: { id: dependencyId },
        update: {},
        create: { id: dependencyId, taskId: id, dependsOnTaskId },
      });
    }
  }

  writeFileSync(path.join(docsPath, 'Roadmap.md'), renderRoadmapMarkdown(def, actorRecordByKey), 'utf-8');
  writeFileSync(path.join(docsPath, 'Agentslog.md'), renderAgentslogMarkdown(def), 'utf-8');
}

function ownerCell(task: DemoTaskDef, def: DemoProjectDef): string {
  if (!task.assigneeKey) return '—';
  const actor = def.actors.find((a) => a.key === task.assigneeKey)!;
  return actor.kind === 'AI_AGENT' ? `${actor.displayName}@${task.logTimestamp}` : actor.displayName;
}

function dependsOnCell(task: DemoTaskDef, def: DemoProjectDef): string {
  if (!task.dependsOn?.length) return '—';
  return task.dependsOn
    .map((depKey) => def.tasks.find((t) => t.id === depKey)?.externalId ?? depKey)
    .join(', ');
}

// One source of truth: the same def.tasks array drives both the seeded
// Task rows above and the Roadmap.md rendering here, so the two can never
// drift apart the way two hand-maintained copies would.
function renderRoadmapMarkdown(def: DemoProjectDef, _actorRecordByKey: Map<string, { id: string }>): string {
  const rows = def.tasks.filter((t) => t.table);
  const active = rows.filter((t) => t.table === 'ACTIVE');
  const nearTerm = rows.filter((t) => t.table === 'NEAR_TERM');
  const blocked = rows.filter((t) => t.table === 'BLOCKED');

  const activeTable = [
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...active.map(
      (t) =>
        `| ${t.externalId} | ${t.title} | ${t.acceptanceCriteria ?? '—'} | ${t.status} | ${ownerCell(t, def)} | ${dependsOnCell(t, def)} |`,
    ),
  ];
  if (active.length === 0) activeTable.push('| — | — | — | — | — | — |');

  const nearTermTable = [
    '| ID | Outcome | Acceptance check | Status | Depends on |',
    '| --- | --- | --- | --- | --- |',
    ...nearTerm.map(
      (t) => `| ${t.externalId} | ${t.title} | ${t.acceptanceCriteria ?? '—'} | ${t.status} | ${dependsOnCell(t, def)} |`,
    ),
  ];
  if (nearTerm.length === 0) nearTermTable.push('| — | — | — | — | — |');

  const blockedTable = [
    '| ID | Blocker | Needed decision or event | Owner |',
    '| --- | --- | --- | --- |',
    ...blocked.map((t) => `| ${t.externalId} | ${t.blockedReason} | ${t.neededDecision} | ${ownerCell(t, def)} |`),
  ];
  if (blocked.length === 0) blockedTable.push('| — | — | — | — |');

  return [
    '# Roadmap',
    '',
    'Keep active and near-term work only. Verified completed capability belongs in',
    '`Features.md`; history belongs in `Agentslog.md`.',
    '',
    '## Active work',
    '',
    ...activeTable,
    '',
    '## Near term',
    '',
    ...nearTermTable,
    '',
    '## Blocked',
    '',
    ...blockedTable,
    '',
  ].join('\n');
}

function statusWordFor(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.TERMINADA:
      return 'DONE';
    case TaskStatus.QA:
      return 'QA_REVIEW';
    case TaskStatus.EN_DESARROLLO:
      return 'IN_PROGRESS';
    case TaskStatus.ASIGNADA:
      return 'ASSIGNED';
    case TaskStatus.PENDIENTE:
      return 'CREATED';
  }
}

// Matches the skill's fixed entry format exactly (docs/roadmap-parser.md) —
// same shape production write-back appends via agentslog-writer.util.ts,
// hand-rendered here since this seed builds the whole file at once rather
// than appending one entry at a time.
function renderAgentslogMarkdown(def: DemoProjectDef): string {
  const entries: string[] = [];
  for (const task of def.tasks) {
    if (!task.externalId) continue; // subtasks aren't logged individually
    const agentName = task.assigneeKey
      ? def.actors.find((a) => a.key === task.assigneeKey)!.displayName
      : 'system';
    entries.push(
      [
        `## [${task.logTimestamp}] | ${agentName} | ${task.externalId} | ${statusWordFor(task.status)}`,
        '',
        `- Summary: ${task.status === TaskStatus.TERMINADA ? 'Completed' : task.status === TaskStatus.PENDIENTE ? 'Created' : 'Progress on'}: ${task.title}`,
        '- Files: —',
        '- Verify: —',
        '- Follow-up: —',
      ].join('\n'),
    );
  }

  return `# Agents log\n\n## Entries\n\n${entries.join('\n\n')}\n`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
