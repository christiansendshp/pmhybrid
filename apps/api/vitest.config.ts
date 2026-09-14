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
  },
});
