# Deployment

PM Hub runs as three containers: the database, the API and the web app (Roadmap
IMPROVEMENT-02c). The target runtime is containers, configured by environment
variables; nothing in an image is specific to one environment.

| Service    | Image                                      | Listens | Notes                                                                               |
| ---------- | ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `postgres` | `postgres:17-alpine`                       | 5432    | Not published. Use an outside database instead by pointing `DATABASE_URL` at it.    |
| `api`      | `apps/api/Dockerfile` (node 22, alpine)    | 3000    | Runs as the `node` user. Migrates and bootstraps on start, then serves.             |
| `web`      | `apps/web/Dockerfile` (the build on nginx) | 8080    | Static files with the single-page fallback; writes `config.js` from `API_BASE_URL`. |

`docker-compose.yml` is only the database a laptop develops against; the stack
below is `docker-compose.prod.yml`.

## First deployment

```bash
cp deploy.env.example .env.prod          # fill it in; keep it out of version control
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

A value that must be set is marked `:?` in the compose file, so a missing one stops
the start and names itself. The ones that matter:

| Variable                                        | What it is                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                             | The database's password. Letters and digits: it is put in a connection URL.                                                                           |
| `JWT_SECRET`                                    | Signs every session. At least 32 characters and not a placeholder, or the API refuses to start (`openssl rand -base64 48`).                           |
| `CORS_ORIGINS`                                  | The address the web app is opened at. Without it a browser blocks the API's answers. `*` allows every origin, on purpose only.                        |
| `API_BASE_URL`                                  | The address the **browser** reaches the API at. It becomes `config.js` in the web container.                                                          |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | The first administrator, created on the first start and only while there is none. The password is at least 12 characters.                             |
| `GIT_PROVIDER_TYPE`                             | `local` (default) reads and writes the projects' docs folders under `PROJECTS_DIR`; `github` uses `GITHUB_TOKEN` and the webhook secret.              |
| `PROJECTS_DIR`                                  | With `local`: the folder on the host holding the projects' docs, mounted at `/data/projects`. The `node` user (uid 1000) must be able to write in it. |
| `WEB_PORT`, `API_PORT`                          | The ports published on the host (8080 and 3000).                                                                                                      |

Open the web app at `CORS_ORIGINS` and sign in as the bootstrapped administrator; from
the Team page add people and agents, and create the first project. In a project's
settings, `docsPath` is a path inside the API container (with `local`, under
`/data/projects`).

## What the API does on start

`apps/api/docker-entrypoint.sh`, unless `RUN_MIGRATIONS=false`:

1. `prisma migrate deploy` brings the schema up to date. It only applies migrations
   that were committed; it never resets or invents anything.
2. `node dist/bootstrap/bootstrap.js` writes the access model (permissions, roles and
   which permissions each carries) and, when the database has **no administrator**,
   creates the first one from `BOOTSTRAP_ADMIN_*`. It is safe on every start: with an
   administrator it changes nothing but the access model's additions, and it never
   resets a password. With no administrator and no `BOOTSTRAP_ADMIN_*` it stops the
   start with a message saying what to set. **It writes no demo data:** the demo seed
   (`prisma db seed`) refuses `NODE_ENV=production` on purpose, because it plants an
   administrator with a documented password.
3. The server starts.

Where a separate job migrates the database, set `RUN_MIGRATIONS=false` on the API.

## Health

| Endpoint           | Answers                                                     | Use it as                                                                                                |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /health/live` | `{"status":"ok"}` while the process answers; no database.   | Liveness: a database that is down must not get a healthy API restarted. It is the image's `HEALTHCHECK`. |
| `GET /health`      | 200 with `db: up`, or 503 when the database cannot be read. | Readiness: the API can do its work.                                                                      |
| web `GET /healthz` | `ok`                                                        | The web image's `HEALTHCHECK`.                                                                           |

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The API applies any new migration when it starts. The database volume (`pmhybrid_data`)
is kept; take a `pg_dump` before an upgrade that carries a migration you have not read.

## The web app's API address

The app reads `window.__PMHYBRID__.apiBaseUrl` from `/config.js`, which `index.html` loads
before the app starts. The web image writes that file at start from `API_BASE_URL`, so one
image serves any environment; outside Docker, replace `config.js` next to the app. Empty
means the development default, `http://localhost:3000`.

## Building the images by hand

The build context is the repository root, because both apps depend on `packages/shared-types`:

```bash
docker build -f apps/api/Dockerfile -t pmhybrid-api .
docker build -f apps/web/Dockerfile -t pmhybrid-web .
```

Both install with `--frozen-lockfile --trust-lockfile`: the lockfile is committed and was
checked when it was made, and pnpm 11's step that re-checks every entry against the
registry takes minutes and fails on a slow network. CI builds both images on every push.
