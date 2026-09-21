import { test, expect } from '@playwright/test';

/**
 * The API address is not in the build (Roadmap IMPROVEMENT-02b): `config.js`,
 * a file a deployment replaces, says where the API is, and the same build
 * serves any environment.
 */
test.describe('the API address of a deployment', () => {
  test('is what config.js says, not what the build was made with', async ({ page }) => {
    // The same API, reached by another name: what a deployment's config does.
    await page.route('**/config.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: "window.__PMHYBRID__ = { apiBaseUrl: 'http://127.0.0.1:3000/' };",
      }),
    );
    const calls: string[] = [];
    page.on('request', (request) => calls.push(request.url()));

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

    expect(calls.some((url) => url.startsWith('http://127.0.0.1:3000/'))).toBe(true);
    expect(calls.some((url) => url.startsWith('http://localhost:3000/'))).toBe(false);
  });

  test('is the development address when config.js says nothing', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => calls.push(request.url()));

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

    expect(calls.some((url) => url.startsWith('http://localhost:3000/'))).toBe(true);
  });
});
