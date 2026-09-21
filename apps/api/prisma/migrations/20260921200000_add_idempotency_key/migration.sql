-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_projectId_createdAt_idx" ON "IdempotencyKey"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_projectId_actorId_key_key" ON "IdempotencyKey"("projectId", "actorId", "key");

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
