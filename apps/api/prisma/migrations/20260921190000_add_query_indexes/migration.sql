-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Task_assigneeActorId_idx" ON "Task"("assigneeActorId");

-- CreateIndex
CREATE INDEX "TaskDependency_taskId_idx" ON "TaskDependency"("taskId");

-- CreateIndex
CREATE INDEX "TaskDependency_dependsOnTaskId_idx" ON "TaskDependency"("dependsOnTaskId");

-- CreateIndex
CREATE INDEX "SyncRun_projectId_startedAt_idx" ON "SyncRun"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "Conflict_projectId_resolvedAt_idx" ON "Conflict"("projectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Notification_actorId_createdAt_idx" ON "Notification"("actorId", "createdAt");
