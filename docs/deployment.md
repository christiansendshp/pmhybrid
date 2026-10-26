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
below is `docker-compose.prod.yml`. Each names its own Compose project
(`pmhybrid-dev`/`pmhybrid-prod`), so the two coexist on one machine without
either recreating the other's containers (Roadmap BUG-10).

## First deployment

```bash
cp deploy.env.example .env.prod          # fill it in; keep it out of version control
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

A value that must be set is marked `:?` in the compose file, so a missing one stops
the start and names itself. The ones that matter:

| Variable                                        | What it is                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                             | The database's password. Letters and digits: it is put in a connection URL.                                                                                                                                                                                                                    |
| `JWT_SECRET`                                    | Signs every session. At least 32 characters and not a placeholder, or the API refuses to start (`openssl rand -base64 48`).                                                                                                                                                                    |
| `CORS_ORIGINS`                                  | The address the web app is opened at. Without it a browser blocks the API's answers. `*` allows every origin, on purpose only.                                                                                                                                                                 |
| `API_BASE_URL`                                  | The address the **browser** reaches the API at. It becomes `config.js` in the web container.                                                                                                                                                                                                   |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | The first administrator, created on the first start and only while there is none. The password is at least 12 characters.                                                                                                                                                                      |
| `GIT_PROVIDER_TYPE`                             | `local` (default) reads and writes the projects' docs folders under `PROJECTS_DIR`; `github` uses `GITHUB_TOKEN` and the webhook secret.                                                                                                                                                       |
| `PROJECTS_DIR`                                  | With `local`: the folder on the host holding the projects' docs, mounted at `/data/projects`. The `node` user (uid 1000) must be able to write in it.                                                                                                                                          |
| `DOCUMENTS_DIR`                                 | A folder of the host the folder picker may browse freely (e.g. `C:/Users/me/Documents`), mounted read-write at `/data/documents`. The picker shows it with the host's own path and accepts a path typed that way. Everything inside it is within the API's reach; nothing else of the host is. |
| `WEB_PORT`, `API_PORT`                          | The ports published on the host (8080 and 3000).                                                                                                                                                                                                                                               |

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

## Backups

The database volume (`pmhybrid_data`) holds the **only copy** of things nothing else can
rebuild (Roadmap TASK-52):

- **The audit trail** (`AuditEvent`): who changed what, when, from where. It is append-only
  history; a lost row is lost for good.
- **The LLM configuration** (`LlmSettings`): provider, model and the API key, which is stored
  encrypted with a key derived from `JWT_SECRET`. Keep `JWT_SECRET` (in `.env.prod`) with your
  backups, apart from the dumps: with another secret the dump restores but the key reads as
  "not readable" and is entered again; nothing else depends on it.
- The people, roles and API keys (hashed), comments, notifications, document revisions and the
  daily progress snapshots.

Not in the database: the projects' docs folders (`PROJECTS_DIR`, or the GitHub repository) are
the truth of their own content and are backed up as files; the images are rebuilt.

### Taking a backup

```bash
deploy/backup/backup-postgres.sh \
  --container pmhybrid-prod-postgres-1 --database pmhybrid \
  --dir /var/backups/pmhybrid --keep 14
```

It runs `pg_dump` (custom format) **inside** the container, over its local socket, as the user
the container was created with, so it needs no password and none appears in a command line or
in its output. It writes `pmhybrid-<UTC date>T<UTC time>Z.dump` into the folder, reads the file
back with `pg_restore --list`, and only then keeps it and deletes the older dumps of that
database beyond `--keep` (default 14; at least 1). A run that fails (no such container, not
running, no such database, a folder that does not exist or is not writable) says why, exits
non-zero and deletes nothing. The folder is never created for you: put it on another disk or
machine than the volume, or a dead disk takes both. A dump holds everything the database does,
including the password hashes and the encrypted key, so give the folder the permissions you give
the database (the files are created readable by their owner only).

Schedule it daily, and the restore check weekly (cron on the host, or the scheduler of its OS
running the same `sh` command):

```cron
15 2 * * *  /opt/pmhybrid/deploy/backup/backup-postgres.sh --container pmhybrid-prod-postgres-1 --database pmhybrid --dir /var/backups/pmhybrid --keep 14 >> /var/log/pmhybrid-backup.log 2>&1
45 2 * * 0  /opt/pmhybrid/deploy/backup/restore-check.sh --container pmhybrid-prod-postgres-1 --database pmhybrid --dir /var/backups/pmhybrid >> /var/log/pmhybrid-backup.log 2>&1
```

A database outside Docker (a `DATABASE_URL` pointing elsewhere) is the provider's to back up, or
`pg_dump -Fc` with a `~/.pgpass` file; never the password in the command.

### Checking that a backup restores

A backup nobody has restored is a hope. `restore-check.sh` takes the newest dump of the folder
(or `--file` one), restores it into a **scratch database** of the same container
(`restorecheck_<time>_<pid>`, the only thing it creates), counts the rows of every table of the
public schema in the scratch copy and in the live database, prints both side by side, and drops the
scratch database, then looks for it again and fails loudly if it is still there. The live database
is only read.

Rows written after the dump are normal on a live system, so by default a table whose count differs
is shown as `differs` and is not a failure. These are: `pg_restore` reporting any error, a table of
the live database missing from the dump, and a dump with no rows at all although the database has
some (a schema-only dump). `--strict` makes every difference a failure; use it when nothing is
writing. It needs room for a second copy of the database in the container.

### Restoring

This **replaces the data of the database with the dump's**. If the current state is worth
anything, take a backup first.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api
docker exec -i pmhybrid-prod-postgres-1 sh -c \
  'exec pg_restore -w --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < /var/backups/pmhybrid/pmhybrid-20261026T021500Z.dump
docker compose -f docker-compose.prod.yml --env-file .env.prod start api
```

On a new, empty volume the same command works: `--if-exists` makes the `--clean` of a database with
nothing in it harmless. Start the API afterwards; it applies any migration the dump predates.
Use the same `JWT_SECRET` as when the key was stored.

### How it was tested

`sh deploy/backup/test.sh` (`pnpm test:backup`; a job of `.github/workflows/ci.yml`) starts a
throwaway Postgres container of its own, with a password of its own, and runs the cases against
it: the name and the pruning of the dumps, what a failed backup leaves behind (nothing, and the
older dumps intact), each way a backup or a check can be refused, a restore check that passes, one
that sees rows written since, one with `--strict`, a schema-only dump, a truncated dump, no scratch
database left in any of them, the restore command above bringing back deleted rows, and that the
password appears in no output and in neither script. It removes the container when it ends.
On 2026-10-26 the scripts were also run by hand against the e2e database (`pmhybrid_test`) of the
development container: 30 tables and 15 208 rows restored, every count equal under `--strict`, the
scratch database gone. They were not run against the persistent stack.

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The API applies any new migration when it starts. The database volume (`pmhybrid_data`)
is kept; take a backup (above) before an upgrade that carries a migration you have not read.

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
