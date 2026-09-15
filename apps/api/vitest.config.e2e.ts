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
    },
    // Multi-request scenarios hold advisory locks for write-back; the 5s
    // default is too tight for them on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
