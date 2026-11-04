import { defineConfig } from 'vitest/config';

// Read by `ng test` (angular.json "runnerConfig": true makes the builder look for a file
// named vitest-base.config.*). The 5 s default is too tight for the specs that route and
// render real pages when the machine is busy: with VALIDAR sharing it, the first test of
// app.routes.spec.ts, 1 s alone, took 5.6 s (Roadmap GAP-48).
export default defineConfig({
  test: {
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
