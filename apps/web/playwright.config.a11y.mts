import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../..');
const STORAGE_STATE = path.join(configDir, '.playwright-a11y-auth.json');

/**
 * Automated accessibility check (Roadmap GAP-25, brief §21's WCAG 2.2 AA
 * target): a real Chromium session against the app shell plus one
 * representative page per surface mode, scored with axe-core
 * (`@axe-core/playwright` — real layout/contrast computation, unlike
 * axe-core under jsdom). See docs/Stack_Tecnologies.md ADR-014 for why
 * Playwright over a manual audit or a jsdom-based check.
 *
 * Needs both real dev servers up (not the in-process Nest app the api e2e
 * suite uses) — `webServer` starts them the same way `.claude/launch.json`
 * does locally, and CI adds its own step after the existing e2e job so the
 * already-migrated/seeded database is in place.
 */
export default defineConfig({
  testDir: './a11y',
  outputDir: './test-results',
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      cwd: repoRoot,
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter web dev',
      cwd: repoRoot,
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
