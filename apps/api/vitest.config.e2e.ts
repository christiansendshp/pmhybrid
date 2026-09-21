import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';
import { LOCAL_TEST_DATABASE_URL } from './test/test-database.js';

export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Local runs start from a freshly reset test database (Roadmap TEST-01a).
    globalSetup: ['./test/global-setup.ts'],
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
    // default is too tight for them on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
