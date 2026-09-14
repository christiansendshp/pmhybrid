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
