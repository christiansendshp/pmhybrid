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
