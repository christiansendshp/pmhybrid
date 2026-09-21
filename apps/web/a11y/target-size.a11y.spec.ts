import { test, expect } from '@playwright/test';

/**
 * Every button and link is at least 24 by 24 CSS pixels (WCAG 2.5.8, the
 * brief's WCAG 2.2 AA target; Roadmap UX-02c). A link inside running text is the
 * exception the criterion makes, so an `inline` anchor is not counted.
 */
const routes = [
  '/dashboard',
  '/projects',
  '/workload',
  '/team',
  '/roles',
  '/projects/pmhybrid-self/kanban',
  '/projects/pmhybrid-self/progress',
  '/projects/pmhybrid-self/documents',
  '/projects/pmhybrid-self/conflicts',
  '/projects/pmhybrid-self/audit',
  '/projects/pmhybrid-self/settings',
];

for (const route of routes) {
  test(`${route} has no target under 24px`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const small = await page.evaluate(() => {
      const found: string[] = [];
      const targets = document.querySelectorAll(
        'button, a[href], [role="button"], [role="link"], input:not([type="hidden"]), [role="combobox"], mat-checkbox',
      );
      for (const el of targets) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) {
          continue;
        }
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
          continue;
        }
        if (box.width < 24 || box.height < 24) {
          found.push(
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(box.width)}x${Math.round(box.height)} "${(el.textContent ?? '').trim().slice(0, 24)}"`,
          );
        }
      }
      return found;
    });

    expect(small).toEqual([]);
  });
}

test('a select says what it is for, not only what it shows (audit log, task detail)', async ({
  page,
}) => {
  await page.goto('/projects/pmhybrid-self/audit');
  await expect(page.getByRole('combobox', { name: 'Filtrar por origen' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filtrar por entidad' })).toBeVisible();
});
