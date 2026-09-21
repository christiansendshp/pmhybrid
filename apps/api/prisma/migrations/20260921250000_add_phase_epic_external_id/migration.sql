-- Roadmap GAP-35d: the id of the Roadmap entry a phase or an epic mirrors.
-- Nullable, so those made in the app have none; NULLs do not collide in the
-- unique index.
ALTER TABLE "Phase" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Epic" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Phase_projectId_externalId_key" ON "Phase"("projectId", "externalId");
CREATE UNIQUE INDEX "Epic_projectId_externalId_key" ON "Epic"("projectId", "externalId");
