# Agents log

Recent append-only ledger. Keep one entry per logical change, no more than six
lines or roughly 700 characters. Older segments live in `docs/history/`.

## Entry format

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | DONE

- Summary: observable outcome
- Files: compact paths or component names
- Verify: command and result
- Follow-up: none or one pointer
```

## Entries

## [2026-09-14T16:30:08Z] | claude-code | FASE-02 | IN_PROGRESS

- Summary: Bootstrapped project-documentation skill on PMHYBRID itself per user instruction: installed .claude/skills/project-documentation, merged CLAUDE.md adapter block, seeded real ProductDescription/Stack_Tecnologies/Roadmap content
- Files: CLAUDE.md, docs/ProductDescription.md, docs/Stack_Tecnologies.md, docs/Roadmap.md, .claude/skills/project-documentation/
- Verify: project_docs.sh check -> OK
- Follow-up: Continue FASE-02: write architecture.md, domain-model.md, synchronization.md, roadmap-parser.md

## [2026-09-14T16:32:43Z] | claude-code | FASE-02 | DONE

- Summary: Wrote docs/architecture.md, docs/domain-model.md, docs/synchronization.md, docs/roadmap-parser.md per the approved plan
- Files: docs/architecture.md, docs/domain-model.md, docs/synchronization.md, docs/roadmap-parser.md
- Verify: project_docs.sh check -> OK
- Follow-up: Start FASE-03: scaffold pnpm monorepo, NestJS api, Angular web, Prisma schema, docker-compose

## [2026-09-14T17:15:02Z] | claude-code | FASE-03 | DONE

- Summary: Scaffolded pnpm monorepo: NestJS apps/api (17 modules, Prisma schema+migrations+seed, Terminus health check), Angular apps/web (9 lazy routes, Material/CDK, ESLint), packages/shared-types, docker-compose Postgres, Husky+lint-staged+commitlint. Fixed: port 5432 conflict (moved to 5436), Prisma migrate dev interactive hang (CI=true), NestJS DI silently failing under Vitest (esbuild drops emitDecoratorMetadata -> added unplugin-swc). git init done, 2 local commits, no remote/push.
- Files: package.json, pnpm-workspace.yaml, docker-compose.yml, apps/api/**, apps/web/**, packages/shared-types/**, .husky/**, README.md
- Verify: pnpm -r lint && pnpm -r build && pnpm -r test -> all green; pnpm test:e2e -> 1 passed; curl /health -> 200 db up; ng serve -> 200; pre-commit/commit-msg hooks verified firing on a trial commit
- Follow-up: Start FASE-04: Auth + Users (JWT, login, guard)

## [2026-09-14T17:35:13Z] | claude-code | FASE-04 | DONE

- Summary: Real JWT auth: argon2id password hashing, access+stateless-refresh tokens (type claim, no RefreshToken table - ADR-005), Passport JwtStrategy/JwtAuthGuard, /auth/login+refresh+me. Users module (list/get/create over Actor kind=HUMAN) behind JwtAuthGuard only, permissionGuard still stubbed for FASE-05. Angular: real AuthService (access token in-memory Signal, refresh token in localStorage - ADR-006), authInterceptor (attach+one-shot 401 refresh retry), real authGuard, real Material login page, provideAppInitializer silent refresh on boot. Seed adds demo-human password (demo1234, documented in README). Fixed a real bug: JwtAuthGuard used via @UseGuards in UsersModule needs PassportModule re-exported from AuthModule (AuthGuard-derived guards resolve deps against the consuming module, not just the declaring one) -- broke the whole AppModule bootstrap incl. /health until fixed.
- Files: apps/api/src/modules/auth/**, apps/api/src/modules/users/**, apps/api/src/common/decorators/current-actor-id.decorator.ts, apps/api/src/main.ts, apps/api/prisma/seed.ts, apps/api/prisma/demo-credentials.ts, apps/api/test/auth.e2e-spec.ts, apps/web/src/app/core/auth.*, apps/web/src/app/features/auth/login/**, apps/web/src/app/app.config.ts, README.md
- Verify: pnpm -r lint && pnpm -r build && pnpm -r test -> all green (5 api unit + 8 web unit); pnpm test:e2e -> 7 passed incl. full login/refresh/guard flow; curl login->refresh->me all verified against live server; browser: real login via Chrome navigated to /projects with POST /auth/login 200 + GET /auth/me 200 network calls, and logged-out direct nav to /projects redirected to /login
- Follow-up: Start FASE-05: Projects + Roles/RBAC
