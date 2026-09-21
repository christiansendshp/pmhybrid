import { test, expect } from '@playwright/test';

/**
 * The layout on a phone (Roadmap UX-02a): no route makes the page itself scroll
 * sideways, and the header stays two rows. A wide table or navigation scrolls
 * inside its own box, which the page-level check does not count, so what it
 * catches is content that is simply too wide for the screen.
 */
const routes: { name: string; url: string }[] = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'my projects', url: '/projects' },
  { name: 'workload', url: '/workload' },
  { name: 'team', url: '/team' },
  { name: 'roles', url: '/roles' },
  { name: 'project (kanban)', url: '/projects/pmhybrid-self/kanban' },
  { name: 'progress', url: '/projects/pmhybrid-self/progress' },
  { name: 'documents', url: '/projects/pmhybrid-self/documents' },
  { name: 'conflicts', url: '/projects/pmhybrid-self/conflicts' },
  { name: 'audit', url: '/projects/pmhybrid-self/audit' },
  { name: 'project settings', url: '/projects/pmhybrid-self/settings' },
];

for (const width of [360, 390]) {
  test.describe(`layout at ${width} px (Roadmap UX-02a)`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const route of routes) {
      test(`${route.name} does not scroll the page sideways`, async ({ page }) => {
        await page.goto(route.url);
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `the page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
      });
    }

    test('the header is the brand and its actions on one row, and the navigation on another', async ({
      page,
    }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const header = await page.locator('.app-header').boundingBox();
      // It took 105px on three rows, with "Cerrar sesión" broken over two lines.
      expect(header!.height).toBeLessThanOrEqual(90);
      const signOut = await page.getByRole('button', { name: 'Cerrar sesión' }).boundingBox();
      expect(signOut!.height).toBeLessThan(48);
    });

    test('the board starts near the top, with its filters folded and its columns stacked (Roadmap UX-02b)', async ({
      page,
    }) => {
      await page.goto('/projects/pmhybrid-self/kanban');
      await page.waitForLoadState('networkidle');

      // The members and the filters are one line each until they are asked for.
      await expect(page.locator('#board-controls')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Filtros y vista/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Miembros \(\d+\)/ })).toBeVisible();

      const columns = page.locator('.column');
      const first = await columns.nth(0).boundingBox();
      const second = await columns.nth(1).boundingBox();
      // Stacked: the second is under the first, not beside it.
      expect(second!.x).toBeLessThanOrEqual(first!.x + 1);
      expect(second!.y).toBeGreaterThan(first!.y);
      // The first column is in the first screen.
      expect(first!.y).toBeLessThan(700);
    });

    test('no column shows more cards than its cap, and offers the rest (Roadmap UX-02b)', async ({
      page,
    }) => {
      await page.goto('/projects/pmhybrid-self/kanban');
      await page.waitForLoadState('networkidle');

      const counts = await page
        .locator('.column__cards')
        .evaluateAll((lists) => lists.map((list) => list.querySelectorAll('.card').length));
      expect(Math.max(...counts)).toBeLessThanOrEqual(8);
    });

    test('says a navigation that goes on past the edge does, and shows the page it is on', async ({
      page,
    }) => {
      await page.goto('/roles');
      await page.waitForLoadState('networkidle');

      const nav = page.getByRole('navigation', { name: 'Navegación principal' });
      await expect(nav).toHaveAttribute('data-scroll-more', /start|both|end/);
      const active = nav.getByRole('link', { name: 'Roles' });
      await expect(active).toBeInViewport();
    });
  });
}
