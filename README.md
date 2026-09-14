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

### Demo login (local dev only)

The seed script creates one HUMAN actor you can log in as at `/login`:

- Email: `demo-human@pmhybrid.local`
- Password: `demo1234`

Not a real secret — just seed data for a fresh local database.
