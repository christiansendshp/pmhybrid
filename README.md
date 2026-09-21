# PM Hub

Project Management Hub for teams of humans and AI agents. See `docs/` for
architecture, domain model, synchronization, and parser specs, and the
project brief (`Prompt — Desarrollo de Project Management Hub Humano + IA.md`)
for the full spec this build follows.

## Stack

Angular + NestJS + PostgreSQL/Prisma, pnpm monorepo. See
`docs/architecture.md`.

## Getting started

```bash
cp .env.example apps/api/.env
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
pnpm dev
```

API: http://localhost:3000 (health check at `/health`)
Web: http://localhost:4200

### Running it as containers

`docker-compose.prod.yml` runs the database, the API and the web app from images built
in this repository, configured by environment variables; `docs/deployment.md` is the
guide. The API migrates the database and writes the access model on start, and creates the
first administrator from `BOOTSTRAP_ADMIN_*` — never the demo login below, nor demo data.

### Demo login (local dev only)

The seed script creates one HUMAN actor you can log in as at `/login`:

- Email: `demo-human@pmhybrid.local`
- Password: `demo1234`

Not a real secret — just seed data for a fresh local database. This actor
holds the global `ADMIN` role, so it is the one that can add further people
and AI agents from the **Team** page. Roles and permissions live in seed data:
re-run `pnpm --filter api prisma:seed` after pulling changes that add them.

### Demo dataset

Besides `pmhybrid-self` (this repo's own `docs/`), the seed script creates two
richer demo projects — **Website Relaunch** and **Mobile App Revamp** — each
with its own `Roadmap.md`/`Agentslog.md` (written to
`apps/api/prisma/demo-projects/`, gitignored, regenerated on every seed run),
multiple phases/epics, subtasks, task dependencies, all five Kanban states,
one blocked task, and a mix of human (`Demo Human`, `Ana García`) and AI-agent
(`Demo Agent`, `Codex`) assignees. The seed is idempotent — safe to re-run
against an existing database.
