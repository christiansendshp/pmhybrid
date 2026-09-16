import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      // Every e2e worker boots the whole app; a scheduler in each one would
      // keep syncing every project in the shared database (including ones
      // earlier runs left behind) and contend with the tests for locks.
      // Tests trigger sync explicitly instead.
      SYNC_SCHEDULER_ENABLED: 'false',
      // Every e2e spec creates several throwaway projects with no cleanup —
      // outside CI (whose Postgres service container is fresh per run and
      // discarded after), that used to leak straight into the same database
      // the dev server and the app in the browser use, polluting "My
      // Projects" with dozens of "... E2E ..." rows. Point local runs at a
      // separate database instead; CI keeps its own DATABASE_URL (job env)
      // pointing at its single, disposable container.
      // `docs/testing.md` "Local e2e database" has the one-time setup.
      ...(process.env.CI
        ? {}
        : {
            DATABASE_URL:
              'postgresql://pmhybrid:pmhybrid@localhost:5436/pmhybrid_test?schema=public',
          }),
    },
    // Multi-request scenarios hold advisory locks for write-back; the 5s
    // default is too tight for them on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
