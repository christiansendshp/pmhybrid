/**
 * How many database connections the e2e suite may hold, which has to stay under the server's
 * `max_connections` (100 by default, and in CI): the files run in parallel and each keeps one
 * Prisma client for its whole run (Roadmap TASK-27, `setup-shared-prisma.ts`). The product of
 * the two is what the suite can ask of Postgres, and it leaves room for the dev server and the
 * global setup.
 */
export const E2E_MAX_WORKERS = 12;
export const E2E_CONNECTIONS_PER_FILE = 6;
