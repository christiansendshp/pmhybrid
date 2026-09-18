import path from 'node:path';
import { test as setup, expect } from '@playwright/test';

// Kept in sync with playwright.config.a11y.mts's own STORAGE_STATE by
// convention (both resolve to apps/web/.playwright-a11y-auth.json) rather
// than a cross-file import — importing from a sibling .mts config file hits
// Node ESM/CJS resolution friction Playwright's own config loader doesn't
// have to deal with. Playwright transforms this spec as CommonJS (apps/web's
// package.json has no "type": "module"), so `__dirname` — not
// `import.meta.dirname` — is the one that actually works here.
const STORAGE_STATE = path.join(__dirname, '..', '.playwright-a11y-auth.json');

// Same documented dev-only credential the api e2e suite already logs in
// with (apps/api/prisma/demo-credentials.ts) — not a secret, and using it
// here (never entered interactively on the user's behalf) matches existing
// project convention rather than inventing a second login path.
const DEMO_EMAIL = 'demo-human@pmhybrid.local';
const DEMO_PASSWORD = 'demo1234';

setup('log in as the seeded demo actor', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
