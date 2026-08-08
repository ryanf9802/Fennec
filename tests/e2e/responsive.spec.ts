import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 375, height: 760 },
  { width: 960, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`game timeline has no horizontal overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?demo=1');
    await expect(
      page.getByRole('heading', { name: 'Game timeline' }),
    ).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(
      page.getByRole('heading', { name: 'Past sessions' }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    if (viewport.width === 960)
      expect((await page.locator('aside').boundingBox())?.width).toBeLessThan(
        90,
      );
    if (viewport.width === 1440)
      expect(
        (await page.locator('aside').boundingBox())?.width,
      ).toBeGreaterThan(200);
  });
}

test('demo feed opens a live match and settings remain usable', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  await expect(page.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();
  await expect(
    page.locator('main .eyebrow').filter({ hasText: /^live match$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Event timeline' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete match' })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Select another player to view their profile'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View profile for Luna' }),
  ).toBeVisible();
  const playerNameWeight = Number(
    await page
      .getByRole('button', { name: 'View profile for Luna' })
      .locator('strong')
      .evaluate((element) => getComputedStyle(element).fontWeight),
  );
  const teamNameWeight = Number(
    await page
      .locator('.scoreboard-table tbody')
      .first()
      .locator('tr')
      .first()
      .locator('th')
      .evaluate((element) => getComputedStyle(element).fontWeight),
  );
  expect(playerNameWeight).toBeLessThan(teamNameWeight);
  const yourRow = page
    .getByRole('row')
    .filter({ has: page.getByText('YOU', { exact: true }) });
  const [yourNameBox, youBadgeBox] = await Promise.all([
    yourRow.locator('strong').boundingBox(),
    yourRow.getByText('YOU', { exact: true }).boundingBox(),
  ]);
  expect(
    Math.abs(
      yourNameBox!.y +
        yourNameBox!.height / 2 -
        (youBadgeBox!.y + youBadgeBox!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  const matchUrl = page.url();
  await page.getByRole('button', { name: 'View profile for Luna' }).click();
  await expect(page).toHaveURL(matchUrl);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Luna' })).toBeVisible();
  await expect(page.getByText('All-time player history')).toHaveCount(0);
  await expect(
    page.locator('.eyebrow').filter({ hasText: /^Together$/ }),
  ).toBeVisible();
  await expect(
    page.locator('.eyebrow').filter({ hasText: /^Opposed$/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Relationship')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByLabel('Relationship')).toBeVisible();
  await page.getByRole('button', { name: 'Close player profile' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(matchUrl);
  await expect(
    page.getByRole('heading', { name: 'Ball analytics' }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Touch map' })).toBeVisible();
  await expect(page.getByRole('img', { name: /ball touch map/i })).toHaveCount(
    0,
  );
  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket port')).toHaveValue('49124');
});

test('3D touch map controls and preference persist across matches', async ({
  page,
}) => {
  await page.goto('/matches/demo-current-2?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Ball analytics' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Touch map' }).click();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();

  const pitch = page.getByRole('slider', { name: 'Field pitch' });
  await expect(pitch).toHaveValue('0');
  await pitch.fill('45');
  await expect(pitch).toHaveAttribute('aria-valuetext', '45 degrees');

  const viewport = page.getByTestId('ball-touch-map-viewport');
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 80, box.y + box.height - 80);
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('data-camera-target', '0,0');
  await page.getByRole('button', { name: /reset 3d touch map view/i }).click();
  await expect(pitch).toHaveValue('0');
  await expect(viewport).toHaveAttribute('data-camera-target', '0,0');

  await page.goto('/matches/demo-current-1?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Ball touch map' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
});

test('completed matches show continuous elapsed time', async ({ page }) => {
  await page.goto('/matches/demo-current-2?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Ranked Doubles' }),
  ).toBeVisible();
  await expect(page.locator('header .text-fennec-orange')).toHaveText('5:00');
  await expect(
    page.getByRole('heading', { name: 'Event timeline' }),
  ).toBeVisible();
  await expect(
    page.locator('.timeline-scroller').getByText('5:00'),
  ).toBeVisible();
});

test('a historical match can be permanently deleted', async ({ page }) => {
  await page.goto('/matches/demo-history-1?demo=1');
  await expect(page.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();
  const matchInfo = page.locator('header p');
  await expect(matchInfo).toContainText('DFH Stadium');
  await matchInfo.getByRole('button', { name: 'Delete match' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Delete this match?' }),
  ).toBeVisible();
  await expect(dialog).toContainText('removed from history and all stats');
  await dialog.getByRole('button', { name: 'Delete match' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/matches/demo-history-1?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Match not found' }),
  ).toBeVisible();
});

test('ending a session moves the live game into a new session', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'End session' }).click();

  await expect(
    page.getByRole('status').filter({
      hasText: 'New session started for the live game.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Live now')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ready for a new session?' }),
  ).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test('settings show installation-relative Stats API instructions', async ({
  page,
}) => {
  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(
    page.getByText(String.raw`2. Open TAGame\Config\TAStatsAPI.ini.`),
  ).toBeVisible();
  await expect(
    page.getByText(
      String.raw`If that file is not present, open TAGame\Config\DefaultStatsAPI.ini instead.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      '3. Change PacketSendRate to 2, save the file, and restart Rocket League.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /copy/i })).toHaveCount(0);
  await expect(page.getByText(/Program Files/)).toHaveCount(0);
});

test('dashboard emphasizes teammate and opponent rosters', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByText('Past sessions')).toBeVisible();
  await expect(
    page.getByText('Teammates:', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Opponents:', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Faced .* before/)).toHaveCount(0);
  await expect(page.getByText(/Select your profile/)).toHaveCount(0);
});

test('primary pages use the same full content width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
  await expect(page.getByText('Second-monitor dashboard')).toHaveCount(0);
  const gamesWidth = (await page.locator('main > div').first().boundingBox())!
    .width;
  for (const [path, heading, removedEyebrow] of [
    ['/settings?demo=1', 'Settings', 'Preferences and storage'],
    ['/profile?demo=1', 'Profile', 'Identity'],
    ['/onboarding?demo=1', 'Connect Rocket League', undefined],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    if (removedEyebrow)
      await expect(page.getByText(removedEyebrow, { exact: true })).toHaveCount(
        0,
      );
    expect(
      (await page.locator('main > div').first().boundingBox())!.width,
    ).toBeCloseTo(gamesWidth, 0);
  }
});

test('primary pages reserve a stable root scrollbar gutter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
  const games = await page.evaluate(() => ({
    mainWidth: document.querySelector('main')!.getBoundingClientRect().width,
    rootScrolls:
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
  }));
  expect(games).toMatchObject({ rootScrolls: false, gutter: 'stable' });

  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const settings = await page.evaluate(() => ({
    mainWidth: document.querySelector('main')!.getBoundingClientRect().width,
    rootScrolls:
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
  }));
  expect(settings.rootScrolls).toBe(true);
  expect(settings.mainWidth).toBe(games.mainWidth);
});

test('desktop sidebar connection status fits without clipping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 620 });
  await page.goto('/?demo=1');
  const sidebar = page.locator('aside');
  const status = sidebar.getByRole('status');
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute(
    'aria-label',
    /^Connection status: Demo · /,
  );
  const [sidebarBox, statusBox] = await Promise.all([
    sidebar.boundingBox(),
    status.boundingBox(),
  ]);
  expect(statusBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x);
  expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(
    sidebarBox!.x + sidebarBox!.width,
  );
  const labelDimensions = await status
    .locator('span')
    .last()
    .evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
  expect(labelDimensions.scroll).toBeLessThanOrEqual(labelDimensions.client);
});

test('scoreboard columns align and the desktop timeline scrolls independently', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 780 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  const scoreHeader = page.getByRole('columnheader', {
    name: 'Score',
    exact: true,
  });
  await expect(scoreHeader).toBeVisible();
  const headerBox = await scoreHeader.boundingBox();
  const scoreBox = await page
    .locator('.scoreboard-table tbody td')
    .first()
    .boundingBox();
  expect(
    Math.abs(
      headerBox!.x + headerBox!.width / 2 - (scoreBox!.x + scoreBox!.width / 2),
    ),
  ).toBeLessThan(1);
  await expect(
    page.getByRole('columnheader', { name: 'Goals', exact: true }),
  ).toBeVisible();
  const timelineScroller = page.locator('.timeline-scroller');
  expect(
    await timelineScroller.evaluate(
      (element) => getComputedStyle(element).overflowY,
    ),
  ).toBe('auto');
});

test('scrollable areas use compact theme-aware scrollbars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 620 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  const styles = await page
    .locator('.timeline-scroller')
    .evaluate((element) => ({
      width: getComputedStyle(element, '::-webkit-scrollbar').width,
      thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb')
        .backgroundColor,
      radius: getComputedStyle(element, '::-webkit-scrollbar-thumb')
        .borderRadius,
    }));
  expect(styles).toEqual({
    width: '8px',
    thumb: 'rgba(150, 168, 191, 0.32)',
    radius: '999px',
  });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(
    await page
      .locator('.timeline-scroller')
      .evaluate(
        (element) =>
          getComputedStyle(element, '::-webkit-scrollbar-thumb')
            .backgroundColor,
      ),
  ).toBe('rgba(58, 84, 116, 0.28)');
});

test('mobile scoreboard scroll stays inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  await page.getByText('Live now').click();
  const scoreboardScroller = page.locator('.scoreboard-table').locator('..');
  const dimensions = await scoreboardScroller.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  const documentDimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(documentDimensions.scroll).toBeLessThanOrEqual(
    documentDimensions.client,
  );
});

test('auto-open remains opt-in and navigates when enabled', async ({
  page,
}) => {
  await page.goto('/settings?demo=1');
  await expect(page).toHaveURL(/settings/);
  await page.getByLabel('Automatically open the live monitor').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page).toHaveURL(/\/live/, { timeout: 5000 });
});
