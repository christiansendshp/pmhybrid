import { test, expect } from '@playwright/test';

/**
 * The way back from a task to the board (Roadmap UX-02b). The breadcrumb's link
 * to the board was relative to a route of two segments and led to
 * `/tasks/kanban`, a task that does not exist; and the filters of the board were
 * lost on the way.
 */
test.describe('the board and a task (Roadmap UX-02b)', () => {
  test('the breadcrumb leads back to the board', async ({ page }) => {
    await page.goto('/projects/pmhybrid-self/kanban');
    await page.locator('.card__title').first().click();
    const crumbs = page.getByRole('navigation', { name: 'Ruta de navegación' });
    await expect(crumbs).toBeVisible();

    await crumbs.getByRole('link', { name: 'Tablero' }).click();

    await expect(page).toHaveURL(/\/projects\/pmhybrid-self\/kanban$/);
    await expect(page.getByRole('heading', { name: 'Kanban' })).toBeVisible();
  });

  test('the filters are in the address, and are still there after a task and back', async ({
    page,
  }) => {
    await page.goto('/projects/pmhybrid-self/kanban');
    await page.getByLabel('Buscar').fill('sync');
    // Replaced, not pushed: typing is not a page to go back to.
    await expect(page).toHaveURL(/\/kanban\?q=sync$/);

    await page.locator('.card__title').first().click();
    await page
      .getByRole('navigation', { name: 'Ruta de navegación' })
      .getByRole('link', { name: 'Tablero' })
      .click();

    await expect(page).toHaveURL(/\/kanban\?q=sync$/);
    await expect(page.getByLabel('Buscar')).toHaveValue('sync');
  });

  test('a board opened from its address has the filters it names', async ({ page }) => {
    await page.goto('/projects/pmhybrid-self/kanban?q=zzz-nothing-matches');

    await expect(page.getByLabel('Buscar')).toHaveValue('zzz-nothing-matches');
    await expect(page.getByText('Ninguna tarea coincide con estos filtros.')).toBeVisible();
  });
});
