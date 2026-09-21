import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  // swc replaces esbuild's TS transform so `emitDecoratorMetadata` output
  // (Nest's constructor-type-based DI) is actually emitted — esbuild drops it.
  plugins: [tsconfigPaths(), swc.vite()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Only when run with --coverage (`pnpm test:cov`, CI). The floor sits just
    // under what the unit specs measured on 2026-09-21 (43.8 statements, 43.2
    // branches, 36.5 functions, 43.5 lines); most of the app is exercised by
    // the e2e suite, which has its own, higher floor (Roadmap TEST-01b).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { statements: 42, branches: 41, functions: 34, lines: 42 },
    },
  },
});
