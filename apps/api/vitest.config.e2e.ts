import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';
import { HOST_MOUNTS_ENV } from './test/helpers/host-mounts.js';
import { E2E_MAX_WORKERS } from './test/e2e-limits.js';
import { LOCAL_TEST_DATABASE_URL } from './test/test-database.js';

export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Local runs start from a freshly reset test database (Roadmap TEST-01a).
    globalSetup: ['./test/global-setup.ts'],
    // One shared Prisma connection for the applications a file boots (Roadmap TASK-27).
    setupFiles: ['./test/setup-shared-prisma.ts'],
    // Files in parallel, bounded by the connections each holds (see e2e-limits.ts).
    maxWorkers: E2E_MAX_WORKERS,
    env: {
      // Every e2e worker boots the whole app; a scheduler in each one would
      // keep syncing every project in the shared database (including ones
      // earlier runs left behind) and contend with the tests for locks.
      // Tests trigger sync explicitly instead.
      SYNC_SCHEDULER_ENABLED: 'false',
      // A fixed test secret so github-webhook.e2e-spec.ts can sign requests
      // the running app will accept; no other spec touches this endpoint.
      GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
      // Projects may only point docsPath inside these roots (Roadmap
      // SECURITY-01). Specs create scratch docs folders in the OS temp dir
      // (which is not under the home dir on Linux CI) and some use folders
      // under the working tree, so both are allowed here; the default
      // (home dir alone) stays what a real deployment gets.
      PROJECT_DOCS_BROWSE_ROOT: [homedir(), tmpdir()].join(path.delimiter),
      // Two folders the suite is told are one folder of the user's machine, as a
      // Docker mount that is mounted twice is (Roadmap UX-05).
      PROJECT_DOCS_HOST_MOUNTS: HOST_MOUNTS_ENV,
      // Every e2e spec creates several throwaway projects with no cleanup —
      // outside CI (whose Postgres service container is fresh per run and
      // discarded after), that used to leak straight into the same database
      // the dev server and the app in the browser use, polluting "My
      // Projects" with dozens of "... E2E ..." rows. Point local runs at a
      // separate database instead; CI keeps its own DATABASE_URL (job env)
      // pointing at its single, disposable container.
      // `docs/testing.md` "Local e2e database" has the one-time setup.
      ...(process.env.CI ? {} : { DATABASE_URL: LOCAL_TEST_DATABASE_URL }),
    },
    // Multi-request scenarios hold advisory locks for write-back; the 5s
    // default is too tight for them on a busy machine. Twice that again for the
    // run with coverage, where more than sixty files boot the whole app at once
    // and a test that waits for background work (the title queue) was measured
    // at 22s against its 20s with nothing wrong with it.
    testTimeout: 40_000,
    hookTimeout: 30_000,
    // Only when run with --coverage (`pnpm test:e2e:cov`, CI). The floor sits
    // just under what the e2e suite measured on 2026-09-21 (86.2 statements,
    // 76.4 branches, 89.9 functions, 86.1 lines): a drop below it means code
    // was added without a test that runs it (Roadmap TEST-01b).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { statements: 84, branches: 74, functions: 87, lines: 84 },
    },
  },
});
