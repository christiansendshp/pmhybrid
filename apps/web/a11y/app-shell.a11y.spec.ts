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
    // The section of what is new since the last visit is the first thing under the title (Roadmap TASK-39).
    await expect(page.getByRole('heading', { name: 'Desde tu última visita' })).toBeVisible();
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

  test('docsPath folder picker (explorer dialog, Roadmap UX-05)', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await page.getByRole('button', { name: 'Explorar…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Elegir carpeta de documentos' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Elegir esta carpeta' })).toBeEnabled();
    // The error text of the form behind the dialog fades in; axe must not read its colour half way (a flake
    // in a full run, never alone: the measured foreground was the page's own background).
    await page.waitForTimeout(600);
    await checkA11y(page, 'folder-picker');
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

  test('project pace (forecast, bars, burn-up and their tables, Roadmap TASK-37)', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.projects__name').first().click();
    await page.getByRole('link', { name: 'Seguimiento' }).click();
    await expect(page.getByRole('heading', { name: 'Seguimiento' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cuándo termina el trabajo abierto' })).toBeVisible();
    await checkA11y(page, 'pace');
  });

  test('task detail (styled sections, breadcrumb, Roadmap UX-03c1)', async ({ page }) => {
    // This repository's own project is the seeded one that has tasks.
    await page.goto('/projects/pmhybrid-self/kanban');
    await page.locator('.card__title').first().click();
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toBeVisible();
    await checkA11y(page, 'task-detail');
  });

  // Every other signed-in route (Roadmap TEST-01d). The project routes use this
  // repository's own project, the seeded one that has tasks and history.
  const routes: { name: string; url: string; heading: string | RegExp }[] = [
    { name: 'workload', url: '/workload', heading: 'Carga de trabajo' },
    { name: 'team', url: '/team', heading: 'Equipo' },
    { name: 'roles', url: '/roles', heading: 'Roles' },
    { name: 'application settings (Roadmap GAP-39b)', url: '/settings', heading: 'Configuración' },
    { name: 'task list (Roadmap TASK-18)', url: '/projects/pmhybrid-self/list', heading: 'Lista' },
    { name: 'review queue (Roadmap TASK-19)', url: '/projects/pmhybrid-self/review', heading: 'En revisión' },
    { name: 'view by agent (Roadmap TASK-20)', url: '/projects/pmhybrid-self/agents', heading: 'Por agente' },
    { name: 'timeline (Roadmap TASK-23)', url: '/projects/pmhybrid-self/timeline', heading: 'Línea de tiempo' },
    { name: 'conflicts', url: '/projects/pmhybrid-self/conflicts', heading: 'Conflictos' },
    { name: 'audit', url: '/projects/pmhybrid-self/audit', heading: 'Auditoría' },
    { name: 'project settings', url: '/projects/pmhybrid-self/settings', heading: 'Configuración' },
    { name: 'project page (members and roles)', url: '/projects/pmhybrid-self', heading: /PM Hub/ },
  ];
  for (const route of routes) {
    test(`${route.name} (Roadmap TEST-01d)`, async ({ page }) => {
      await page.goto(route.url);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
      await checkA11y(page, route.name);
    });
  }
});
