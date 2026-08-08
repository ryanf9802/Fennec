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
  await expect(page.getByRole('heading', { name: 'Event timeline' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Luna/ })).toBeVisible();
  await page.getByRole('button', { name: /Luna/ }).click();
  const dialog = page.getByRole('dialog', { name: /Luna/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Played together')).toBeVisible();
  await expect(dialog.getByText('Played against')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close player history' }).click();
  await expect(page.getByRole('heading', { name: 'Ball analytics' })).toBeVisible();
  await expect(page.getByRole('img', { name: /ball touch map/i })).toBeVisible();
  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket port')).toHaveValue('49124');
  await expect(page.getByText(String.raw`C:\Program Files (x86)\Steam\steamapps\common\rocketleague\TAGame\Config\TAStatsAPI.ini`)).toBeVisible();
  await expect(page.getByText(String.raw`C:\Program Files\Epic Games\rocketleague\TAGame\Config\TAStatsAPI.ini`)).toBeVisible();
});

test('dashboard emphasizes teammate and opponent rosters', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByText('Past sessions')).toBeVisible();
  await expect(page.getByText('Teammates:', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Opponents:', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Faced .* before/)).toHaveCount(0);
  await expect(page.getByText(/Select your profile/)).toHaveCount(0);
});

test('primary pages use the same full content width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Game timeline' })).toBeVisible();
  const gamesWidth = (await page.locator('main > div').first().boundingBox())!.width;
  for (const [path, heading] of [['/settings?demo=1', 'Settings'], ['/profile?demo=1', 'Profile'], ['/onboarding?demo=1', 'Connect Rocket League']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect((await page.locator('main > div').first().boundingBox())!.width).toBeCloseTo(gamesWidth, 0);
  }
});

test('scoreboard columns align and the desktop timeline scrolls independently', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 780 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  const scoreHeader = page.getByRole('columnheader', { name: 'Score', exact: true });
  await expect(scoreHeader).toBeVisible();
  const headerBox = await scoreHeader.boundingBox();
  const scoreBox = await page.locator('.scoreboard-table tbody td').first().boundingBox();
  expect(Math.abs((headerBox!.x + headerBox!.width / 2) - (scoreBox!.x + scoreBox!.width / 2))).toBeLessThan(1);
  await expect(page.getByRole('columnheader', { name: 'Goals', exact: true })).toBeVisible();
  const timelineScroller = page.locator('.timeline-scroller');
  expect(await timelineScroller.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
});

test('mobile scoreboard scroll stays inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  const scoreboardScroller = page.locator('.scoreboard-table').locator('..');
  const dimensions = await scoreboardScroller.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  const documentDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(documentDimensions.scroll).toBeLessThanOrEqual(documentDimensions.client);
});

test('auto-open remains opt-in and navigates when enabled', async ({ page }) => {
  await page.goto('/settings?demo=1');
  await expect(page).toHaveURL(/settings/);
  await page.getByLabel('Automatically open the live monitor').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page).toHaveURL(/\/live/, { timeout: 5000 });
});
