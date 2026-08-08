import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 375, height: 760 }, { width: 960, height: 720 }, { width: 1440, height: 900 }]) {
  test(`game timeline has no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?demo=1');
    await expect(page.getByRole('heading', { name: 'Game timeline' })).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.getByRole('heading', { name: 'Past sessions' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    if (viewport.width === 960) expect((await page.locator('aside').boundingBox())?.width).toBeLessThan(90);
    if (viewport.width === 1440) expect((await page.locator('aside').boundingBox())?.width).toBeGreaterThan(200);
  });
}

test('demo feed opens a live match and settings remain usable', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  await expect(page.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();
  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket port')).toHaveValue('49124');
});

test('auto-open remains opt-in and navigates when enabled', async ({ page }) => {
  await page.goto('/settings?demo=1');
  await expect(page).toHaveURL(/settings/);
  await page.getByLabel('Automatically open the live monitor').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page).toHaveURL(/\/live/, { timeout: 5000 });
});
