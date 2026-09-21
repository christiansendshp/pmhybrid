import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

/**
 * Known, already-triaged violations we accept for now rather than block on
 * (Roadmap GAP-25's acceptance check explicitly allows "violations fixed or
 * logged as known limitations"). Keyed by page name -> axe rule ids. A new
 * violation not listed here still fails the run — this is a ratchet, not a
 * blanket suppression. See docs/Features.md's known-limitations entry for
 * why each one is deferred rather than fixed here.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {};

async function checkA11y(page: Page, pageName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();

  const allowed = new Set(KNOWN_VIOLATIONS[pageName] ?? []);
  const unexpected = results.violations.filter((violation) => !allowed.has(violation.id));

  expect(
    unexpected,
    unexpected
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
      )
      .join('\n\n'),
  ).toEqual([]);
}

test.describe('accessibility (Roadmap GAP-25)', () => {
  test('app shell + dashboard (auth surface, default landing page)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
    await checkA11y(page, 'dashboard');
  });

  test('login (unauthenticated form surface)', async ({ page, context }) => {
    // Independent of the shared storageState — this page must be reachable
    // signed out.
    await context.clearCookies();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await checkA11y(page, 'login');
  });

  test('my projects (list/table surface)', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Mis proyectos' })).toBeVisible();
    await checkA11y(page, 'my-projects');
  });

  test('kanban board (dense interactive surface)', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.projects__name').first().click();
    await expect(page.getByRole('heading', { name: 'Kanban' })).toBeVisible();
    await checkA11y(page, 'kanban');
  });

  test('documents viewer (read-heavy surface)', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.projects__name').first().click();
    await page.getByRole('link', { name: 'Documentos' }).click();
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
    await checkA11y(page, 'documents');
  });

  test('project progress (bars and percentages, Roadmap UX-03b)', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.projects__name').first().click();
    await page.getByRole('link', { name: 'Progreso' }).click();
    await expect(page.getByRole('heading', { name: 'Fases y progreso' })).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toBeVisible();
    await checkA11y(page, 'progress');
  });
});
