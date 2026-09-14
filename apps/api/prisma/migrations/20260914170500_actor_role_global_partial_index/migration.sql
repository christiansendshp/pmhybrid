-- Postgres treats NULL as distinct in a unique constraint, so the
-- Prisma-generated @@unique([actorId, roleId, projectId]) does not dedupe
-- global role grants (projectId IS NULL). See docs/domain-model.md.
CREATE UNIQUE INDEX "actor_role_global_uq"
  ON "ActorRole" ("actorId", "roleId")
  WHERE "projectId" IS NULL;
