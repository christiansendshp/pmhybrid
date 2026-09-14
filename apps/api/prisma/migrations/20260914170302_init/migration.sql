-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('HUMAN', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'PROJECT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'ASIGNADA', 'EN_DESARROLLO', 'QA', 'TERMINADA');

-- CreateEnum
CREATE TYPE "RoadmapTable" AS ENUM ('ACTIVE', 'NEAR_TERM', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskSourceOrigin" AS ENUM ('UI', 'ROADMAP');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('ROADMAP', 'AGENTSLOG', 'PRODUCT_DESCRIPTION', 'STACK_TECH', 'FEATURES', 'AGENTS_RULES');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('SYNC', 'UI');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING');

-- CreateEnum
CREATE TYPE "AuditOrigin" AS ENUM ('UI', 'ROADMAP', 'AGENTSLOG', 'SYNC', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG', 'CONCURRENT_FIELD_EDIT', 'WRITE_BACK_COLLISION');

-- CreateEnum
CREATE TYPE "ConflictResolutionKind" AS ENUM ('KEEP_LOCAL', 'KEEP_EXTERNAL', 'MANUAL_EDIT', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProgressRollupStrategy" AS ENUM ('EQUAL_WEIGHT_AVERAGE', 'LEAF_EQUAL_WEIGHT');

-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,
    "kind" "ActorKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredential" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "providerUserId" TEXT,

    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "configJson" JSONB,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "ActorRole" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "ActorRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "epicId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "epicId" TEXT,
    "templateId" TEXT,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDIENTE',
    "priority" TEXT,
    "progressPercent" INTEGER,
    "startDate" TIMESTAMP(3),
    "estimatedDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "assigneeActorId" TEXT,
    "assigneeLockedAt" TIMESTAMP(3),
    "rawOwner" TEXT,
    "ownerClaimedAt" TIMESTAMP(3),
    "acceptanceCriteria" TEXT,
    "roadmapTable" "RoadmapTable",
    "blockedReason" TEXT,
    "neededDecision" TEXT,
    "sourceOrigin" "TaskSourceOrigin" NOT NULL,
    "lastSyncedContentHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT,
    "rawExternalRef" TEXT,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "assignedByActorId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "filePath" TEXT NOT NULL,
    "lastKnownHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncRunId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "RevisionSource" NOT NULL,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "summary" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLogEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskExternalId" TEXT,
    "taskId" TEXT,
    "agentName" TEXT NOT NULL,
    "timestampFromLog" TIMESTAMP(3) NOT NULL,
    "statusWord" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "files" TEXT NOT NULL,
    "verify" TEXT NOT NULL,
    "followUp" TEXT NOT NULL,
    "rawEntryHash" TEXT NOT NULL,
    "sourceDocumentRevisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ConflictKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "localVersion" JSONB NOT NULL,
    "externalVersion" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByActorId" TEXT,
    "resolutionStrategy" "ConflictResolutionKind",

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "origin" "AuditOrigin" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT,
    "docsPath" TEXT NOT NULL,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "progressRollupStrategy" "ProgressRollupStrategy" NOT NULL DEFAULT 'EQUAL_WEIGHT_AVERAGE',
    "nextTaskSeq" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Actor_email_key" ON "Actor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredential_actorId_key" ON "UserCredential"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_actorId_key" ON "AgentProfile"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_scope_key" ON "Role"("name", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ActorRole_actorId_roleId_projectId_key" ON "ActorRole"("actorId", "roleId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_actorId_key" ON "ProjectMember"("projectId", "actorId");

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_externalId_key" ON "Task"("projectId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_projectId_kind_key" ON "Document"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLogEvent_rawEntryHash_key" ON "AgentLogEvent"("rawEntryHash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");

-- AddForeignKey
ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorRole" ADD CONSTRAINT "ActorRole_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorRole" ADD CONSTRAINT "ActorRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorRole" ADD CONSTRAINT "ActorRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeActorId_fkey" FOREIGN KEY ("assigneeActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_assignedByActorId_fkey" FOREIGN KEY ("assignedByActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLogEvent" ADD CONSTRAINT "AgentLogEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLogEvent" ADD CONSTRAINT "AgentLogEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_resolvedByActorId_fkey" FOREIGN KEY ("resolvedByActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
