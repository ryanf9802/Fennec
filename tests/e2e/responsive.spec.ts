import { expect, test, type Page } from '@playwright/test';

const autoOpenDisabled = new WeakSet<Page>();

async function waitForAppEntrance(page: Page) {
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
}

async function disableAutomaticLiveMatch(page: Page) {
  if (autoOpenDisabled.has(page)) return;
  if (page.url() === 'about:blank') {
    await page.goto('/settings?demo=1');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  }
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fennec');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('settings', 'readwrite');
        const settings = transaction.objectStore('settings');
        const request = settings.get('settings');
        request.onsuccess = () => {
          settings.put({
            key: 'settings',
            value: {
              ...(request.result?.value ?? {}),
              autoOpenLiveMatch: false,
            },
          });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
  autoOpenDisabled.add(page);
}

async function openDemoPage(page: Page, path: string) {
  await disableAutomaticLiveMatch(page);
  await page.goto(path);
  await waitForAppEntrance(page);
}

async function openLiveDemo(page: Page, path = '/?demo=1') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/live$/, { timeout: 5000 });
  await waitForAppEntrance(page);
}

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\/?$/, (socket) =>
    socket.close({ code: 1001, reason: 'E2E isolated' }),
  );
  await page.route('http://127.0.0.1:49125/**', (route) =>
    route.fulfill({ status: 503 }),
  );
});

test('landing page stays concise and usable across viewport sizes', async ({
  page,
}) => {
  for (const viewport of [
    { width: 375, height: 760 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/landing/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Your Rocket League games, remembered.',
      }),
    ).toBeVisible();
    const appLinks = page.locator('[data-fennec-app-link]');
    await expect(appLinks).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(appLinks.nth(index)).toHaveAttribute(
        'href',
        `${new URL(page.url()).origin}/`,
      );
    }
    await expect(
      page.getByRole('link', { name: /GitHub/ }).first(),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /demo/i })).toHaveCount(0);
    await expect(page.getByText('MIT License').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Passes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '50s' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '3D touch map' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pressure' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Territory gained' }),
    ).toBeVisible();
    const diagrams = page.locator('.feature-visual');
    await expect(diagrams).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      const card = page.locator('.feature-card').nth(index);
      const number = await card.locator('.feature-number').boundingBox();
      const diagram = await card.locator('.feature-visual').boundingBox();
      const heading = await card.getByRole('heading').boundingBox();
      expect(diagram!.x).toBeGreaterThan(number!.x + number!.width);
      expect(heading!.y - (number!.y + number!.height)).toBeLessThanOrEqual(32);
    }
    await expect(page.getByText(/team field pressure/)).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
});

for (const viewport of [
  { width: 375, height: 760 },
  { width: 960, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`game timeline has no horizontal overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openDemoPage(page, '/?demo=1');
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
  await openLiveDemo(page);
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
  await expect(
    page.getByRole('columnheader', { name: '50', exact: true }).first(),
  ).toBeVisible();
  const lunaRow = page.getByRole('row').filter({
    has: page.getByRole('button', { name: 'View profile for Luna' }),
  });
  await expect(lunaRow.locator('td').nth(4)).toHaveText('1', {
    timeout: 5000,
  });
  const playerNameWeight = Number(
    await page
      .getByRole('button', { name: 'View profile for Luna' })
      .locator('strong')
      .evaluate((element) => getComputedStyle(element).fontWeight),
  );
  const teamNameWeight = Number(
    await page
      .locator('.scoreboard-team-header')
      .first()
      .locator('h3')
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
    page.getByRole('heading', { name: 'Ball touch map' }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Touch map' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
  await disableAutomaticLiveMatch(page);
  await page.goto('/settings?demo=1');
  await waitForAppEntrance(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket port')).toHaveValue('49124');
});

test('live match stays visible for an unrelated selected player', async ({
  page,
}) => {
  await openLiveDemo(page);
  await expect(page.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();

  await disableAutomaticLiveMatch(page);
  await page.evaluate(async () => {
    const { saveProfile } = await import('../../src/data/database');
    await saveProfile({
      primaryId: 'Epic|archived-player|0',
      displayName: 'Archived Player',
    });
  });

  await page.goto('/?demo=1');
  await expect(page.getByText('Live now')).toBeVisible({ timeout: 5000 });
  const liveLink = page.getByRole('link', { name: 'Live match' }).first();
  await expect(liveLink).toBeVisible();
  await liveLink.click();
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();
});

test('dark is the default while system and light remain opt-in', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openDemoPage(page, '/settings?demo=1');

  const appearance = page.getByLabel('Appearance');
  await expect(appearance).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page
        .locator('html')
        .evaluate((element) => getComputedStyle(element).colorScheme),
    )
    .toBe('dark');

  await appearance.selectOption('system');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(appearance).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(appearance).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await appearance.selectOption('light');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(appearance).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('speed units default to km/h and persist as mph', async ({ page }) => {
  await openDemoPage(page, '/matches/demo-current-2?demo=1');
  await page.getByRole('tab', { name: 'Ball analytics' }).click();
  const fastestHit = page.getByText('Fastest hit').locator('..');
  const maximumBallSpeed = page.getByText('Maximum ball speed').locator('..');
  await expect(fastestHit).toContainText('126 km/h');
  await expect(maximumBallSpeed).toContainText('62 km/h');

  await page.goto('/settings?demo=1');
  const speedUnits = page.getByLabel('Speed units');
  await expect(speedUnits).toHaveValue('kmh');
  await speedUnits.selectOption('mph');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await page.reload();
  await expect(speedUnits).toHaveValue('mph');
  await page.goto('/matches/demo-current-2?demo=1');
  await expect(fastestHit).toContainText('78 mph');
  await expect(maximumBallSpeed).toContainText('38 mph');
});

test('pressure is an explainable responsive telemetry view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoPage(page, '/matches/demo-current-2?demo=1');
  await page.getByRole('tab', { name: 'Pressure' }).click();

  await expect(page.getByRole('heading', { name: 'Pressure' })).toBeVisible();
  await expect(page.getByText(/A pressure touch is unambiguous/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Team pressure comparison' }),
  ).toBeVisible();
  const playerList = page.getByRole('list', {
    name: 'Pressure and territory contribution by player',
  });
  await expect(playerList).toBeVisible();
  await expect(playerList.getByRole('listitem')).toHaveCount(4);
  await expect(playerList.getByText('Team contribution').first()).toBeVisible();
  await expect(playerList.getByText('Avg territory').first()).toBeVisible();
  const pressurePanel = page.locator('#ball-pressure-panel');
  expect(
    await pressurePanel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pressure' })).toBeVisible();
  const table = page.getByRole('table', {
    name: 'Pressure and territory contribution by player',
  });
  await expect(table).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Team contribution' }),
  ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Avg territory' }),
  ).toBeVisible();
  expect(
    await pressurePanel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

test('desktop match telemetry tabs stay inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/matches/demo-current-2?demo=1');

  const expectViewportContained = async () => {
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector('aside')!.getBoundingClientRect();
      return {
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        sidebarBottom: sidebar.bottom,
      };
    });
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.scrollY).toBe(0);
    expect(layout.sidebarBottom).toBe(layout.clientHeight);
  };

  await expect(
    page.getByRole('heading', { name: 'Ball touch map' }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText([
    'Touch map',
    'Pressure',
    'Ball analytics',
  ]);
  await expectViewportContained();

  await page.getByRole('tab', { name: 'Pressure' }).click();
  await expect(page.getByRole('heading', { name: 'Pressure' })).toBeVisible();
  await expectViewportContained();
  const scoreboard = page.locator('.scoreboard-container');
  expect(
    await scoreboard.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  const pressureRows = page
    .getByRole('table', {
      name: 'Pressure and territory contribution by player',
    })
    .getByRole('row');
  await scoreboard.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(pressureRows.last()).toBeInViewport();
  await expectViewportContained();

  await page.getByRole('tab', { name: 'Touch map' }).click();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
  await expectViewportContained();

  await page.getByRole('tab', { name: 'Pressure' }).click();
  await expect(page.getByRole('heading', { name: 'Pressure' })).toBeVisible();
  await expectViewportContained();

  await page.getByRole('tab', { name: 'Ball analytics' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ball analytics' }),
  ).toBeVisible();
  await expectViewportContained();
});

test('3D touch map controls and preference persist across matches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoPage(page, '/matches/demo-current-2?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Ball touch map' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Ball analytics' }).click();
  await page.getByRole('tab', { name: 'Touch map' }).click();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
  await expect(page.getByTestId('ball-touch-map-loading-overlay')).toHaveCount(
    0,
  );
  await expect(page.getByTestId('ball-touch-map-content')).not.toHaveAttribute(
    'inert',
    '',
  );
  const viewport = page.getByTestId('ball-touch-map-viewport');
  await expect(
    viewport.getByText(
      'Left drag to pan · right drag to rotate · scroll or pinch to zoom',
    ),
  ).toBeVisible();
  await expect(page.getByText('● Blue touch')).toHaveCount(0);
  await expect(page.getByText('■ Blue goal')).toHaveCount(0);
  await expect(
    page.getByRole('img', { name: /Your goal Blue, Opponent goal Orange/i }),
  ).toBeVisible();
  await expect(viewport.getByText('Your goal')).toHaveCount(0);

  const savePoint = page.getByRole('button', {
    name: /You · Save, at 1:00/,
  });
  await savePoint.focus();
  await expect(viewport.getByText('You · Save')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /You · Goal #1 scoring touch, at 1:50/,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /You · touch, at 0:00/ }),
  ).toHaveCount(0);

  const goalPoint = page.getByRole('button', {
    name: /You · Goal #1 scored, at 2:00/,
  });
  await goalPoint.focus();
  await expect(viewport.getByText('You · Goal #1 scored')).toBeVisible();

  const documentSize = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(documentSize.scrollHeight).toBeLessThanOrEqual(
    documentSize.clientHeight,
  );

  const pitch = page.getByRole('slider', { name: 'Field pitch' });
  const rotation = page.getByRole('slider', { name: 'Field rotation' });
  await expect(pitch).toHaveValue('0');
  await expect(rotation).toHaveValue('0');
  await expect(rotation).toHaveAttribute('min', '-90');
  await expect(rotation).toHaveAttribute('max', '90');
  await rotation.fill('-90');
  await expect(viewport).toHaveAttribute('data-camera-yaw', '-90');
  await rotation.fill('90');
  await expect(viewport).toHaveAttribute('data-camera-yaw', '90');
  await page.getByRole('button', { name: /reset 3d touch map view/i }).click();
  await expect(rotation).toHaveValue('0');
  await pitch.fill('45');
  await expect(pitch).toHaveAttribute('aria-valuetext', '45 degrees');

  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await expect(viewport).toHaveCSS('cursor', 'grab');

  const matchColumn = page.locator('.scoreboard-container');
  const initialScrollTop = await matchColumn.evaluate(
    (element) => element.scrollTop,
  );
  const initialDistance = await viewport.getAttribute('data-camera-distance');
  await page.mouse.wheel(0, 100);
  await expect(viewport).not.toHaveAttribute(
    'data-camera-distance',
    initialDistance!,
  );
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, 100);
  }
  expect(
    Number(await viewport.getAttribute('data-camera-distance')),
  ).toBeLessThanOrEqual(Number(initialDistance) * 1.1);
  await expect
    .poll(() => matchColumn.evaluate((element) => element.scrollTop))
    .toBe(initialScrollTop);

  await page.mouse.down();
  await expect(viewport).toHaveCSS('cursor', 'grabbing');
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + 180);
  await expect
    .poll(async () => {
      const [targetX = Number.NaN, targetZ = Number.NaN] =
        (await viewport.getAttribute('data-camera-target'))!
          .split(',')
          .map(Number);
      return targetX < 0 && targetZ < 0;
    })
    .toBe(true);
  const [pannedTargetX = Number.NaN, pannedTargetZ = Number.NaN] =
    (await viewport.getAttribute('data-camera-target'))!.split(',').map(Number);
  expect(pannedTargetX).toBeLessThan(0);
  expect(pannedTargetZ).toBeLessThan(0);
  await page.mouse.up();
  await expect(viewport).toHaveCSS('cursor', 'grab');
  await expect(viewport).not.toHaveAttribute('data-camera-target', '0,0');
  await page.getByRole('button', { name: /reset 3d touch map view/i }).click();
  await expect(pitch).toHaveValue('0');
  await expect(viewport).toHaveAttribute('data-camera-target', '0,0');
  await rotation.fill('90');
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + 120);
  await expect
    .poll(async () => {
      const [targetX = Number.NaN, targetZ = Number.NaN] =
        (await viewport.getAttribute('data-camera-target'))!
          .split(',')
          .map(Number);
      return Math.abs(targetX) <= 1 && targetZ > 0;
    })
    .toBe(true);
  await page.mouse.up();
  await page.getByRole('button', { name: /reset 3d touch map view/i }).click();
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, -100);
  }
  expect(
    Number(await viewport.getAttribute('data-camera-distance')),
  ).toBeLessThanOrEqual(Number(initialDistance) * 0.51);
  await page.getByRole('button', { name: /reset 3d touch map view/i }).click();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
  await page.mouse.up({ button: 'right' });
  await expect(pitch).toHaveValue('30');
  await expect(rotation).toHaveValue('-30');
  await expect(viewport).toHaveAttribute('data-camera-target', '0,0');
  expect(
    await viewport.evaluate((element) => {
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);

  await page.goto('/matches/demo-current-1?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Ball touch map' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
});

test('custom team identity uses exact accents and theme-colored text', async ({
  page,
}) => {
  await openDemoPage(page, '/matches/demo-history-1?demo=1');
  const neonHeader = page
    .locator('.scoreboard-team-header')
    .filter({ hasText: 'Neon Foxes' });
  const solarHeader = page
    .locator('.scoreboard-team-header')
    .filter({ hasText: 'Solar Flare' });
  await expect(neonHeader).toBeVisible();
  await expect(solarHeader).toBeVisible();

  const teamStyles = await page
    .locator('.scoreboard-team-header [data-team-number]')
    .evaluateAll((swatches) =>
      swatches.slice(0, 2).map((swatch) => {
        const style = getComputedStyle(swatch);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
        };
      }),
    );
  expect(teamStyles).toEqual([
    { background: 'rgb(101, 217, 238)', border: 'rgb(37, 99, 235)' },
    { background: 'rgb(250, 204, 21)', border: 'rgb(239, 68, 68)' },
  ]);
  await expect(page.locator('[data-scoreboard-team]')).toHaveCount(2);
  await expect(page.getByLabel('Neon Foxes score 3')).toBeVisible();
  await expect(page.getByLabel('Solar Flare score 1')).toBeVisible();
  await expect(neonHeader).toHaveCSS('color', 'rgb(244, 248, 255)');
  await page.getByRole('tab', { name: 'Touch map' }).click();
  const touchMap = page.getByTestId('ball-touch-map-viewport');
  const scene = touchMap.getByRole('img', { name: /3d ball touch map/i });
  await expect(scene).toBeVisible();
  await expect(touchMap.getByRole('alert')).toHaveCount(0);
  await expect(scene).toHaveAccessibleName(
    /Your goal Neon Foxes, Opponent goal Solar Flare/i,
  );

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await expect(neonHeader).toHaveCSS('color', 'rgb(16, 35, 61)');
  await expect(
    page.locator('.scoreboard-team-header [data-team-number="0"]'),
  ).toHaveCSS('background-color', 'rgb(101, 217, 238)');
});

test('touch map stays behind the cinematic loader until its scene is ready', async ({
  page,
}) => {
  let releaseModule: () => void = () => undefined;
  const moduleGate = new Promise<void>((resolve) => {
    releaseModule = resolve;
  });
  await page.route('**/src/components/BallTouchScene.tsx*', async (route) => {
    await moduleGate;
    await route.continue();
  });

  await openDemoPage(page, '/matches/demo-current-2?demo=1');
  await page.getByRole('tab', { name: 'Touch map' }).click();

  const loader = page.getByTestId('ball-touch-map-loading-overlay');
  const frame = page.getByTestId('ball-touch-map-frame');
  await expect(loader).toHaveAccessibleName('Loading 3D touch map');
  await expect(page.getByTestId('ball-touch-map-content')).toHaveAttribute(
    'inert',
    '',
  );
  const loadingHeight = await frame.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  releaseModule();
  await expect(
    page.getByRole('img', { name: /3d ball touch map/i }),
  ).toBeVisible();
  await expect(loader).toHaveAccessibleName('Opening 3D touch map');
  await expect
    .poll(() =>
      frame.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeCloseTo(loadingHeight, 1);
  await expect(loader).toHaveCount(0);
  expect(
    await frame.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeCloseTo(loadingHeight, 1);
  await expect(page.getByTestId('ball-touch-map-content')).not.toHaveAttribute(
    'inert',
    '',
  );
});

test('completed matches show continuous elapsed time', async ({ page }) => {
  await openDemoPage(page, '/matches/demo-current-2?demo=1');
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
  await openDemoPage(page, '/matches/demo-history-1?demo=1');
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
  await openDemoPage(page, '/?demo=1');
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
  await openDemoPage(page, '/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Stats API setup steps' });
  await expect(steps).toBeVisible();
  expect(
    await steps.evaluate((element) => getComputedStyle(element).color),
  ).toBe(
    await page.locator('body').evaluate((body) => getComputedStyle(body).color),
  );
  await expect(steps.locator('.surface-strong')).toHaveCount(0);
  await expect(
    page.getByText(
      'Steam: Library → right-click Rocket League → Manage → Browse local files.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Epic: Library → Rocket League’s three-dot menu → Manage → select the folder icon next to Uninstall.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(String.raw`Open TAGame\Config\TAStatsAPI.ini.`),
  ).toBeVisible();
  await expect(
    page.getByText(
      String.raw`If it is not present, open TAGame\Config\DefaultStatsAPI.ini instead.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Change PacketSendRate to 2 and save the file.'),
  ).toBeVisible();
  await expect(
    page.getByText('Launch or restart Rocket League.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Fennec will verify the Stats API connection once the game is running.',
    ),
  ).toBeVisible();
  await expect(steps.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /copy/i })).toHaveCount(0);
  await expect(page.getByText(/Program Files/)).toHaveCount(0);
  const openSetup = page.getByRole('link', { name: 'Open setup' });
  await expect(openSetup).toBeVisible();
  await expect(openSetup.locator('svg.lucide-list-checks')).toBeVisible();
  await expect(
    page.getByText(/set Local network access to Allow, then reload Fennec/),
  ).toBeVisible();
});

test('settings keep companion after Sessions and omit timeline controls', async ({
  page,
}) => {
  await openDemoPage(page, '/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const headings = await page
    .getByRole('heading', { level: 2 })
    .allTextContents();

  expect(headings.indexOf('Sessions and behavior')).toBeGreaterThanOrEqual(0);
  expect(headings.indexOf('Companion service')).toBeGreaterThan(
    headings.indexOf('Sessions and behavior'),
  );
  expect(headings).not.toContain('Event timeline');
  await expect(page.getByText('Everything exposes')).toHaveCount(0);
  await expect(page.getByText('Default preset')).toHaveCount(0);

  expect(headings.indexOf('Local data')).toBeGreaterThan(
    headings.indexOf('Companion service'),
  );
  expect(headings.indexOf('Monitoring')).toBeGreaterThan(
    headings.indexOf('Local data'),
  );
});

test('settings merge data management with an authoritative companion', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-companion-token', 'e2e-token');
  });
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/permission-probe') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '0.3.0',
        protocolVersion: 1,
        dataSyncVersion: 1,
        paired: path === '/status',
        gameRunning: true,
        feedConnected: false,
        stores: ['steam'],
        configuredStores: ['steam'],
        launchOnStartup: true,
        canonicalMatches: 42,
        pendingFrames: 0,
        databaseBytes: 2_097_152,
        lastSyncedAt: '2026-08-10T12:00:00Z',
        updateStatus: 'current',
        resourceUsage: {
          cpuPercent: 0.2,
          memoryBytes: 25 * 1024 * 1024,
          recentPeakCpuPercent: 0.6,
          recentPeakMemoryBytes: 28 * 1024 * 1024,
          recentWindowSeconds: 60,
          sampledAt: '2026-08-10T12:00:00Z',
        },
      }),
    });
  });

  await page.goto('/settings?demo=0');

  await expect(
    page.getByRole('heading', { name: 'Data and companion' }),
  ).toBeVisible();
  await expect(
    page.getByText(/companion keeps the durable copy/i),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rebuild browser cache' }),
  ).toBeVisible();
  const restore = page.getByRole('button', { name: 'Restore backup' });
  await expect(restore).toBeDisabled();
  await expect(restore).toHaveAccessibleDescription(
    /^Close Rocket League.*before restoring a backup.*deleting history\.$/,
  );
  await expect(
    page.getByText(
      /^Close Rocket League.*before restoring a backup.*deleting history\.$/,
    ),
  ).toHaveAttribute('role', 'status');
  await expect(
    page.getByRole('button', { name: 'Delete all history' }),
  ).toBeDisabled();
  await expect(
    page.getByText('42 matches · 2.0 MB in the companion'),
  ).toBeVisible();
  const footprint = page.getByLabel('Live companion footprint');
  await expect(footprint).toContainText('Companion process only');
  await expect(footprint).toContainText('0.2%');
  await expect(footprint).toContainText('0.6% 1 min peak');
  await expect(footprint).toContainText('25.0 MiB');
  await expect(footprint).toContainText('28.0 MiB 1 min peak');
  await expect(page.getByText(/stay in this browser/i)).toHaveCount(0);
});

test('browser-only setup uses instructions and follows the Stats API connection', async ({
  page,
}) => {
  await openDemoPage(page, '/onboarding?demo=1');
  await page.getByRole('button', { name: /Browser only/ }).click();

  const requirement = page
    .getByRole('listitem')
    .filter({ hasText: 'Enable the Rocket League Stats API' });
  await expect(requirement.locator('svg.text-emerald-400')).toBeVisible();
  await expect(
    requirement.getByText("Fennec is connected to Rocket League's Stats API."),
  ).not.toBeVisible();
  const disclosure = requirement.getByText(
    'Enable the Rocket League Stats API',
  );
  await disclosure.click();
  await expect(
    requirement.getByText("Fennec is connected to Rocket League's Stats API."),
  ).toBeVisible();
  await expect(
    requirement.getByText(String.raw`Open TAGame\Config\TAStatsAPI.ini.`),
  ).toBeVisible();
  await disclosure.click();
  await expect(
    requirement.getByText(String.raw`Open TAGame\Config\TAStatsAPI.ini.`),
  ).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Choose Stats API file' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Keep Fennec open and verify the feed'),
  ).toHaveCount(0);
  await expect(page.getByText('Browser-only limitations:')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Browser-only setup is complete. Start Rocket League and keep Fennec open while you play to capture matches.',
    ),
  ).toBeVisible();
  const instructions = page.getByRole('region', {
    name: 'Setup instructions',
  });
  await expect(
    instructions.getByRole('button', { name: 'Recheck' }),
  ).toHaveCount(0);
  await expect(
    instructions.getByRole('link', { name: 'Official Stats API guide' }),
  ).toBeVisible();
  await expect(
    instructions.getByText(
      'Setup instructions remain available from the navigation.',
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('fennec-stats-api-verified-v1'),
    ),
  ).toBeNull();
});

test('previously verified browser setup stays complete while Rocket League is closed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
    localStorage.setItem('fennec-stats-api-verified-v1', 'true');
  });
  await page.goto('/setup?demo=0');
  await waitForAppEntrance(page);

  const requirement = page
    .getByRole('listitem')
    .filter({ hasText: 'Enable the Rocket League Stats API' });
  await expect(requirement.locator('svg.text-emerald-400')).toBeVisible();
  await expect(
    requirement.getByText(
      'Fennec previously connected successfully. Start Rocket League to reconnect.',
    ),
  ).not.toBeVisible();
  await requirement.getByText('Enable the Rocket League Stats API').click();
  await expect(
    requirement.getByText(
      'Fennec previously connected successfully. Start Rocket League to reconnect.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Browser-only setup is complete. Start Rocket League and keep Fennec open while you play to capture matches.',
    ),
  ).toBeVisible();
  const currentConnection = page.getByRole('status', {
    name: /Connection status:/,
  });
  await expect(currentConnection).toBeVisible();
  expect(['connecting', 'unavailable']).toContain(
    await currentConnection.getAttribute('data-connection-state'),
  );
});

test('PWA identity uses only the Fennec name', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page).toHaveTitle('Fennec');
});

test('document loads use the cinematic app entrance', async ({ page }) => {
  await disableAutomaticLiveMatch(page);
  await page.goto('/?demo=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance',
    'cinematic',
  );
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance',
    'cinematic',
  );
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );

  await page.goto('/settings?demo=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance',
    'cinematic',
  );
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
});

test('setup starts with a centered route choice and expands after selection', async ({
  page,
}) => {
  let delayHealthCheck = true;
  await page.route('http://127.0.0.1:49125/health', async (route) => {
    if (delayHealthCheck) {
      delayHealthCheck = false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.fulfill({ status: 503 });
  });
  await page.goto('/setup?demo=0');
  const companion = page.getByRole('button', { name: /With companion/ });
  const browser = page.getByRole('button', { name: /Browser only/ });
  await expect(companion).toBeVisible();
  await expect(browser).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose your setup approach' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Select how you want to set up Fennec. You can change this at any time from the Setup page.',
    ),
  ).toBeVisible();
  await expect(companion).toHaveCSS('cursor', 'pointer');
  await expect(browser).toHaveCSS('cursor', 'pointer');
  const chooserBox = await page.getByTestId('setup-path-intro').boundingBox();
  const viewport = page.viewportSize()!;
  expect(
    Math.abs(chooserBox!.y + chooserBox!.height / 2 - viewport.height / 2),
  ).toBeLessThan(80);
  await expect(
    page.getByRole('heading', { name: 'Connect Fennec' }),
  ).toHaveCount(0);
  await expect(page.getByText('Setup instructions')).toHaveCount(0);

  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await page.evaluate(() => {
    const content = document.querySelector('.app-entrance-content');
    if (!content) throw new Error('App entrance content was not mounted.');
    document.documentElement.dataset.setupContentDetached = 'false';
    new MutationObserver(() => {
      if (!content.isConnected)
        document.documentElement.dataset.setupContentDetached = 'true';
    }).observe(document.body, { childList: true, subtree: true });
  });
  await companion.click();
  await expect(
    page.getByRole('heading', { name: 'Connect Fennec' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Setup instructions' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toHaveCount(0);
  await expect(companion).toHaveAttribute('aria-pressed', 'true');
  expect(
    Number(
      await browser.evaluate((element) => getComputedStyle(element).opacity),
    ),
  ).toBeLessThan(1);
  await expect(page.getByText('Checking the loopback companion…')).toHaveCount(
    0,
  );
  await expect(
    page.getByText('No supported installation has been detected.'),
  ).toHaveCount(0);
  await expect(
    page.getByText('Storefront detection starts after the companion responds.'),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-setup-content-detached',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Open installed companion' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('link', { name: 'Download latest companion' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/ryanf9802/Fennec/releases/latest/download/Fennec-Companion-Windows-x64-setup.exe',
  );

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Connect Fennec' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /With companion/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('setup automatically connects a running companion in the current page', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/pair' && request.method() === 'POST') {
      await route.fulfill({ json: { token: 'in-place-token' } });
      return;
    }
    if (pathname === '/status') {
      await route.fulfill({
        json: {
          version: '0.2.0',
          protocolVersion: 1,
          paired: true,
          gameRunning: false,
          feedConnected: false,
          stores: [],
          configuredStores: [],
          launchOnStartup: false,
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        version: '0.2.0',
        protocolVersion: 1,
        paired: false,
        gameRunning: false,
        feedConnected: false,
        stores: [],
        configuredStores: [],
        launchOnStartup: false,
      },
    });
  });
  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();
  const setupUrl = page.url();
  const pageCount = page.context().pages().length;

  await expect(
    page.getByText('Companion 0.2.0 is running and connected.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open installed companion' }),
  ).toHaveCount(0);
  expect(page.url()).toBe(setupUrl);
  expect(page.context().pages()).toHaveLength(pageCount);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('fennec-companion-token')),
    )
    .toBe('in-place-token');
});

test('setup detects a companion that starts after the page is already open', async ({
  page,
}) => {
  let available = false;
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!available) {
      await route.fulfill({ status: 503 });
      return;
    }
    if (pathname === '/pair' && request.method() === 'POST') {
      await route.fulfill({ json: { token: 'started-later-token' } });
      return;
    }
    await route.fulfill({
      json: {
        version: '0.2.13',
        protocolVersion: 1,
        paired: pathname === '/status',
        gameRunning: false,
        feedConnected: false,
        stores: [],
        configuredStores: [],
        launchOnStartup: false,
      },
    });
  });
  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();
  const setupUrl = page.url();
  const pageCount = page.context().pages().length;
  await expect(
    page.getByRole('button', { name: 'Open installed companion' }),
  ).toBeVisible();

  available = true;

  await expect(
    page.getByText('Companion 0.2.13 is running and connected.'),
  ).toBeVisible({ timeout: 3_000 });
  expect(page.url()).toBe(setupUrl);
  expect(page.context().pages()).toHaveLength(pageCount);
});

test('setup stops showing a previously completed companion as currently ready', async ({
  page,
}) => {
  let available = true;
  await page.addInitScript(() => {
    localStorage.setItem('fennec-companion-token', 'installed-token');
  });
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/permission-probe') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (!available) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: {
        version: '0.2.13',
        protocolVersion: 1,
        paired: pathname === '/status',
        gameRunning: false,
        feedConnected: true,
        stores: ['steam'],
        configuredStores: ['steam'],
        launchOnStartup: true,
      },
    });
  });
  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();

  available = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  const companionStep = page
    .getByRole('listitem')
    .filter({ hasText: 'Install and run the companion' });
  await expect(companionStep.locator('svg.text-fennec-orange')).toBeVisible({
    timeout: 3_000,
  });
  await expect(
    companionStep.getByText(
      'The companion is not running or cannot be reached from this browser.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toHaveCount(0);
});

test('setup treats a pre-automatic-access companion as an update state', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/pair') {
      await route.fulfill({ status: 404 });
      return;
    }
    await route.fulfill({
      json: {
        version: '0.2.12',
        protocolVersion: 1,
        paired: false,
        gameRunning: false,
        feedConnected: false,
        stores: [],
        configuredStores: [],
        launchOnStartup: false,
      },
    });
  });
  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();

  await expect(
    page.getByText(
      'Companion 0.2.12 is running and needs to finish updating before Fennec can connect. Keep it running; updates install automatically when Rocket League is closed.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open installed companion' }),
  ).toHaveCount(0);
  await expect(page.getByText(/not paired/i)).toHaveCount(0);
});

test('incomplete first launch opens Setup and completed setup links to Game timeline', async ({
  page,
}) => {
  await page.goto('/?demo=0');

  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole('heading', { name: 'Choose your setup approach' }),
  ).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
    localStorage.setItem('fennec-stats-api-verified-v1', 'true');
  });
  await page.goto('/setup?demo=0');

  const readyLink = page.getByRole('link', {
    name: 'Fennec is set up and ready to go',
  });
  await expect(readyLink).toHaveAttribute('href', '/');
  await readyLink.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
});

test('setup presents app data protection as optional and completes it when granted', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let protectedStorage = false;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 0, quota: 1_073_741_824 }),
        persisted: async () => protectedStorage,
        persist: async () => {
          protectedStorage = true;
          return true;
        },
      },
    });
  });
  await disableAutomaticLiveMatch(page);
  await page.goto('/setup?demo=1');
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await page.getByRole('button', { name: /Browser only/ }).click();

  const protection = page.locator('[data-storage-protection-state]');
  await expect(protection).toHaveAttribute(
    'data-storage-protection-state',
    'recommended',
  );
  await expect(protection.getByText('Highly recommended')).toBeVisible();
  await expect(protection.locator('svg.text-fennec-cyan')).toBeVisible();
  await expect(protection.locator('.lucide-triangle-alert')).toHaveCount(0);
  await expect(protection.getByText(/not a backup/i)).toBeVisible();
  await expect(
    protection.getByText(/match history, selected player, and settings/i),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();

  await protection.getByRole('button', { name: 'Protect app data' }).click();
  await expect(protection).toHaveAttribute(
    'data-storage-protection-state',
    'protected',
  );
  await expect(
    protection.getByText('Browser storage protection is on.'),
  ).toBeVisible();
  await expect(protection.locator('svg.text-emerald-400')).toBeVisible();

  await page.getByRole('button', { name: /With companion/ }).click();
  await expect(
    protection.getByText(/companion remains the durable copy/i),
  ).toBeVisible();
});

test('declined app data protection stays neutral and does not block setup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 0, quota: 1_073_741_824 }),
        persisted: async () => false,
        persist: async () => false,
      },
    });
  });
  await disableAutomaticLiveMatch(page);
  await page.goto('/setup?demo=1');
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await page.getByRole('button', { name: /Browser only/ }).click();

  const protection = page.locator('[data-storage-protection-state]');
  await protection.getByRole('button', { name: 'Protect app data' }).click();
  await expect(
    protection.getByText(/browser did not grant protection/i),
  ).toBeVisible();
  await expect(protection).toHaveAttribute(
    'data-storage-protection-state',
    'recommended',
  );
  await expect(protection.locator('svg.text-fennec-cyan')).toBeVisible();
  await expect(protection.locator('.lucide-triangle-alert')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();
});

test('empty game timeline focuses on playing the first match', async ({
  page,
}) => {
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\/?$/, (socket) =>
    socket.close({ code: 1001, reason: 'E2E unavailable' }),
  );
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      input === '/__fennec/dev-telemetry'
        ? Promise.resolve(new Response(null, { status: 204 }))
        : fetch(input, init);
  });
  await page.goto('/setup?demo=0');
  await page.evaluate(async () => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
    localStorage.setItem('fennec-stats-api-verified-v1', 'true');
    const { saveProfile } = await import('../../src/data/database');
    await saveProfile({
      primaryId: 'Steam|first-match|0',
      displayName: 'First Match',
    });
  });
  await page.goto('/?demo=0');

  const unavailableStatus = page
    .locator('[role="status"][data-connection-state="unavailable"]:visible')
    .first();
  await expect(unavailableStatus).toHaveAccessibleName(
    'Connection status: Stats API unavailable',
  );
  const emptyTimeline = page.getByRole('region', {
    name: 'Ready for kickoff',
  });
  await expect(
    emptyTimeline.getByRole('heading', { name: 'Ready for kickoff' }),
  ).toBeVisible();
  await expect(
    emptyTimeline.getByText(
      'Start Rocket League and play a match. Fennec will automatically build your game timeline and sessions.',
    ),
  ).toBeVisible();
  await expect(emptyTimeline.getByText(/Stats API/i)).toHaveCount(0);
  await expect(
    emptyTimeline.getByRole('link', { name: 'Open setup guide' }),
  ).toHaveCount(0);
});

test('selected setup path reactively controls desktop and mobile navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem('fennec-companion-setup-complete-v1');
    localStorage.removeItem('fennec-companion-capture-verified-v1');
    localStorage.removeItem('fennec-companion-cursor');
    if (!localStorage.getItem('fennec-setup-path-explicit-v2'))
      localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
    localStorage.setItem('fennec-stats-api-verified-v1', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings?demo=0');
  await waitForAppEntrance(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(
    page.locator('aside').getByRole('link', { name: 'Setup' }),
  ).toHaveCount(0);

  await page.getByRole('link', { name: 'Open setup' }).click();
  await waitForAppEntrance(page);
  await expect(
    page.locator('aside').getByRole('link', { name: 'Setup' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /With companion/ }).click();
  await expect(
    page.getByRole('button', { name: /With companion/ }),
  ).toHaveAttribute('aria-pressed', 'true');

  await expect(page.locator('aside').getByLabel('Games')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.locator('aside').getByLabel('Profile')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(
    page.locator('aside').getByRole('link', { name: 'Settings' }),
  ).toBeVisible();
  await expect(
    page.locator('aside').getByRole('link', { name: 'Fennec home' }),
  ).toHaveAttribute('href', '/setup');
  await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('link', { name: 'Open setup' }).click();

  await page.setViewportSize({ width: 390, height: 760 });
  await expect(page.locator('nav.fixed').getByLabel('Games')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(
    page.locator('nav.fixed').getByRole('link', { name: 'Settings' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Browser only/ }).click();
  await expect(
    page.locator('nav.fixed').getByRole('link', { name: 'Games' }),
  ).toHaveAttribute('href', '/');
  await page
    .locator('nav.fixed')
    .getByRole('link', { name: 'Profile' })
    .click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(
    page.locator('nav.fixed').getByRole('link', { name: 'Setup' }),
  ).toHaveCount(0);

  await page
    .locator('nav.fixed')
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Open setup' }).click();
  await page.getByRole('button', { name: /With companion/ }).click();
  await page.evaluate(() => {
    history.pushState(null, '', '/profile?demo=0');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/setup$/);
});

test('ready panel navigates through a cinematic entrance replay', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
    localStorage.setItem('fennec-stats-api-verified-v1', 'true');
  });
  await page.goto('/setup?demo=0');
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );

  await page
    .getByRole('link', { name: 'Fennec is set up and ready to go' })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance',
    'cinematic',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
});

test('settings companion link selects the companion setup guide', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
  });
  await openDemoPage(page, '/settings?demo=1');

  const setupLink = page.getByRole('link', { name: 'Setup center' });
  await expect(setupLink).toHaveAttribute('href', '/setup?path=companion');
  await setupLink.click();

  await expect(page).toHaveURL(/\/setup\?path=companion$/);
  await expect(
    page.getByRole('button', { name: /With companion/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'Setup instructions' }),
  ).toBeVisible();
  await expect(page.getByText('Install and run the companion')).toBeVisible();

  await page.getByRole('button', { name: /Browser only/ }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole('button', { name: /Browser only/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('Enable the Rocket League Stats API'),
  ).toBeVisible();
});

test('companion launch preferences are managed only in settings', async ({
  page,
}) => {
  let dashboardCommandSeen = false;
  await page.addInitScript(() => {
    localStorage.setItem('fennec-companion-token', 'e2e-token');
  });
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/permission-probe') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.startsWith('/commands/')) {
      dashboardCommandSeen = path.endsWith('/enable-dashboard-auto-open');
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '0.2.1',
        protocolVersion: 1,
        paired: path === '/status',
        gameRunning: false,
        feedConnected: true,
        stores: ['steam', 'epic'],
        configuredStores: ['steam', 'epic'],
        launchOnStartup: false,
        openDashboardOnGameStart: false,
        updateStatus: 'current',
      }),
    });
  });

  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Launch Fennec with Rocket League' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Enable Windows startup (recommended)' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add Steam shortcut' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add Epic shortcut' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Use a compatible companion protocol'),
  ).toHaveCount(0);
  await expect(page.getByText(/protocol versions match/i)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toBeVisible();

  await page.goto('/settings?demo=0');
  await expect(
    page.getByRole('button', { name: 'Enable Windows startup (recommended)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add Steam shortcut' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add Epic shortcut' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open dashboard with Rocket League' })
    .click();
  await expect.poll(() => dashboardCommandSeen).toBe(true);
  await expect(
    page.getByText('The dashboard will open when Rocket League starts.'),
  ).toBeVisible();
});

test('one configured storefront completes its companion setup step and remains reconfigurable', async ({
  page,
}) => {
  let configuredStores: Array<'steam' | 'epic'> = [];
  let steamConfigureCommands = 0;
  await page.addInitScript(() => {
    localStorage.setItem('fennec-companion-token', 'e2e-token');
  });
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/permission-probe') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === '/commands/configure-steam') {
      steamConfigureCommands += 1;
      configuredStores = ['steam'];
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '0.2.1',
        protocolVersion: 1,
        paired: path === '/status',
        gameRunning: false,
        feedConnected: true,
        stores: ['steam', 'epic'],
        configuredStores,
        launchOnStartup: false,
        updateStatus: 'current',
      }),
    });
  });

  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();

  const installationStep = page
    .getByRole('listitem')
    .filter({ hasText: 'Detect and configure Steam or Epic' });
  await expect(
    installationStep.locator('svg.text-fennec-orange'),
  ).toBeVisible();
  await installationStep
    .getByRole('button', { name: 'Configure Steam' })
    .click();

  const reconfigureSteam = installationStep.getByRole('button', {
    name: 'Reconfigure Steam',
  });
  await expect(installationStep.locator('svg.text-emerald-400')).toBeVisible();
  await expect(reconfigureSteam).toHaveClass(/button-loaded/);
  await expect(reconfigureSteam).toBeEnabled();
  await expect(
    installationStep.getByRole('button', { name: 'Configure Epic' }),
  ).toBeVisible();
  await expect(
    installationStep.getByText(
      'Detected Steam and Epic. Steam configuration is verified. Configure Epic too if you use it.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Companion setup is complete for Steam. Fennec can capture matches in the background.',
    ),
  ).toBeVisible();

  await reconfigureSteam.click();
  await expect.poll(() => steamConfigureCommands).toBe(2);
});

test('companion incompatibility is an actionable update state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-companion-token', 'e2e-token');
  });
  await page.route('http://127.0.0.1:49125/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/permission-probe') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '0.1.0',
        protocolVersion: 0,
        paired: path === '/status',
        gameRunning: false,
        feedConnected: false,
        stores: ['steam'],
        configuredStores: ['steam'],
        launchOnStartup: false,
        updateStatus: 'downloading',
      }),
    });
  });

  await page.goto('/setup?demo=0');
  await page.getByRole('button', { name: /With companion/ }).click();

  const companion = page
    .getByRole('listitem')
    .filter({ hasText: 'Install and run the companion' });
  await expect(companion.locator('svg.text-fennec-orange')).toBeVisible();
  await expect(
    companion.getByText(
      'Fennec needs to finish updating before setup can continue. Keep the companion running while it updates automatically.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Use a compatible companion protocol'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Launch Fennec with Rocket League' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Fennec is set up and ready to go' }),
  ).toHaveCount(0);
});

test('dashboard emphasizes teammate and opponent rosters', async ({ page }) => {
  await openDemoPage(page, '/?demo=1');
  await expect(page.getByText('Past sessions')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Select your player' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      name: "Fennec couldn't identify your player",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Teammates:', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Opponents:', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Faced .* before/)).toHaveCount(0);
  await expect(page.getByText(/Select your profile/)).toHaveCount(0);
});

test('session summaries expose recurring teammates and full history in place', async ({
  page,
}) => {
  await openDemoPage(page, '/?demo=1');
  const currentSession = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Current session' }),
  });
  const recurringTeammates = currentSession.getByRole('group', {
    name: 'Recurring teammates',
  });
  await expect(recurringTeammates).toBeVisible();
  await expect(
    recurringTeammates.getByText('Luna', { exact: true }),
  ).toBeVisible();
  expect(
    await recurringTeammates.evaluate(
      (element) =>
        element.parentElement?.querySelector('#current-session-heading') !==
        null,
    ),
  ).toBe(true);

  const sessionPanel = currentSession.getByRole('link', {
    name: 'View current session details',
  });
  await expect(sessionPanel).toBeVisible();
  const sessionCard = sessionPanel.locator('..');
  await expect(
    sessionCard.getByRole('heading', { name: 'Current session' }),
  ).toBeVisible();
  await expect(
    sessionCard.getByRole('button', { name: 'End session' }),
  ).toBeVisible();
  const sectionWidth = (await currentSession.boundingBox())!.width;
  const cardWidth = (await sessionCard.boundingBox())!.width;
  expect(Math.abs(sectionWidth - cardWidth)).toBeLessThan(2);
  await expect(
    currentSession.getByRole('link', { name: /Full session/ }),
  ).toHaveCount(0);
  await sessionPanel.click();
  const sessionUrl = page.url();
  await expect(
    page.getByRole('region', { name: 'Session performance details' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Outcome' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offense' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Involvement' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  const detailRegion = page.getByRole('region', {
    name: 'Session performance details',
  });
  const cardHeights: number[] = [];
  for (const heading of ['Outcome', 'Offense', 'Involvement']) {
    const card = detailRegion
      .getByRole('heading', { name: heading })
      .locator('..');
    cardHeights.push((await card.boundingBox())!.height);
    const statLabels = card.locator('.eyebrow');
    const labelOffsets = await statLabels.evaluateAll((labels) =>
      labels.map((label) => Math.round(label.getBoundingClientRect().top)),
    );
    expect(new Set(labelOffsets).size).toBe(2);
  }
  expect(Math.max(...cardHeights) - Math.min(...cardHeights)).toBeLessThan(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const detailTeammates = page.getByRole('group', {
    name: 'Recurring teammates',
  });
  await expect(detailTeammates).toBeVisible();
  expect(
    await detailTeammates.evaluate(
      (element) => element.parentElement?.tagName === 'P',
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'View profile for Luna' }).click();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByRole('dialog', { name: 'Luna' })).toBeVisible();
  await page.getByRole('button', { name: 'Close player profile' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(sessionUrl);

  await page.goBack();
  await expect(
    currentSession.getByRole('button', { name: 'End session' }),
  ).toBeVisible();
  await currentSession.getByRole('button', { name: 'End session' }).click();
  await expect(page).toHaveURL(/\/?(?:\?demo=1)?$/);
  await expect(currentSession.getByRole('status')).toContainText(
    /New session started|Session ended/,
  );
});

test('match back navigation returns to its session or the game timeline', async ({
  page,
}) => {
  await openDemoPage(page, '/?demo=1');
  await page
    .getByRole('link', { name: 'View current session details' })
    .click();
  const sessionUrl = page.url();

  await page.locator('a[href^="/matches/"]').first().click();
  await page.getByRole('link', { name: 'Session detail' }).click();
  await expect(page).toHaveURL(sessionUrl);

  await page.getByRole('link', { name: 'Game timeline' }).click();
  await page.locator('a[href^="/matches/"]').first().click();
  await page.getByRole('link', { name: 'Game timeline' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

test('profile player selection is searchable and explicit', async ({
  page,
}) => {
  await openDemoPage(page, '/profile?demo=1');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  const readProfileSessionCaches = () =>
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fennec');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      try {
        return await new Promise<Array<{ playerKey: string; stale: number }>>(
          (resolve, reject) => {
            const request = database
              .transaction('profileSessionCaches', 'readonly')
              .objectStore('profileSessionCaches')
              .getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          },
        );
      } finally {
        database.close();
      }
    });
  await expect
    .poll(async () => {
      const caches = await readProfileSessionCaches();
      return caches.map(({ playerKey }) => playerKey);
    })
    .toEqual(['id:Steam|demo-you|0']);
  const search = page.getByRole('combobox', { name: 'Search players' });
  await expect(search).toHaveAttribute(
    'placeholder',
    'Search players by display name',
  );
  await expect(search).toHaveCSS('padding-left', '40px');
  await expect(page.getByText('Play a match to discover players.')).toHaveCount(
    0,
  );
  const loadedPlayer = page.getByRole('button', { name: 'Player loaded' });
  await expect(loadedPlayer).toBeDisabled();
  await expect(loadedPlayer).toHaveCSS(
    'background-image',
    /linear-gradient.*rgb\(110, 231, 183\).*rgb\(52, 211, 153\)/,
  );
  const searchBox = (await search.boundingBox())!;
  const usePlayerBox = (await loadedPlayer.boundingBox())!;
  expect(usePlayerBox.x).toBeGreaterThan(searchBox.x + searchBox.width);
  expect(usePlayerBox.y).toBeCloseTo(searchBox.y, 0);

  await search.fill('Lu');
  await expect(page.getByRole('option', { name: /Luna/ })).toBeVisible();
  await page.getByRole('option', { name: /Luna/ }).click();
  const usePlayer = page.getByRole('button', { name: 'Use player' });
  await expect(usePlayer).toBeEnabled();
  await usePlayer.click();
  await expect(
    page.getByRole('button', { name: 'Player loaded' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Profile updated.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Luna', { exact: true }).first()).toBeVisible();
  await expect
    .poll(async () => {
      const caches = await readProfileSessionCaches();
      return caches
        .map(({ playerKey, stale }) => `${playerKey}:${stale}`)
        .sort();
    })
    .toEqual(['id:Epic|demo-luna|0:0', 'id:Steam|demo-you|0:1']);
});

test('session summaries show goal difference while detail adds the score totals', async ({
  page,
}) => {
  await openDemoPage(page, '/?demo=1');
  const history = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Past sessions' }),
  });
  await expect(
    history.getByText('Goal diff', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Goals for / against', { exact: true }),
  ).toHaveCount(0);

  await history.locator('a[href^="/sessions/"]').first().click();

  await expect(
    page.getByText('Goals for / against', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Goal diff', { exact: true })).toBeVisible();
});

test('primary pages use the same full content width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoPage(page, '/?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Game timeline' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await expect(page.getByText('Second-monitor dashboard')).toHaveCount(0);
  const gamesWidth = (await page.locator('main > div').first().boundingBox())!
    .width;
  for (const [path, heading, removedEyebrow] of [
    ['/settings?demo=1', 'Settings', 'Preferences and storage'],
    ['/profile?demo=1', 'Profile', 'Identity'],
    ['/setup?demo=1', 'Connect Fennec', undefined],
  ] as const) {
    await page.goto(path);
    if (path.startsWith('/setup'))
      await page.getByRole('button', { name: /With companion/ }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-app-entrance-state',
      'complete',
    );
    if (removedEyebrow)
      await expect(page.getByText(removedEyebrow, { exact: true })).toHaveCount(
        0,
      );
    expect(
      (await page.locator('main > div').first().boundingBox())!.width,
    ).toBeCloseTo(gamesWidth, 0);
  }
});

test('settings save action floats above mobile navigation while dirty', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await disableAutomaticLiveMatch(page);
  await page.goto('/settings?demo=1');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-entrance-state',
    'complete',
  );
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(
    0,
  );
  await page.getByLabel('New session after idle minutes').fill('31');

  const save = page.getByRole('button', { name: 'Save settings' });
  await expect(save).toBeVisible();
  await expect(save).toHaveCSS('position', 'fixed');
  await expect(save).toHaveCSS('min-height', '52px');
  await expect(save).toHaveCSS('font-weight', '800');
  const saveBox = (await save.boundingBox())!;
  const mobileNavBox = (await page.locator('nav.fixed').boundingBox())!;
  const documentWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  const rightGap = documentWidth - (saveBox.x + saveBox.width);
  expect(rightGap).toBeGreaterThanOrEqual(16);
  expect(rightGap).toBeLessThanOrEqual(32);
  expect(saveBox.y + saveBox.height).toBeLessThan(mobileNavBox.y);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  expect((await save.boundingBox())!.y).toBeCloseTo(saveBox.y, 0);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopSaveBox = (await save.boundingBox())!;
  expect(900 - (desktopSaveBox.y + desktopSaveBox.height)).toBeCloseTo(32, 0);
  expect(
    1440 - (desktopSaveBox.x + desktopSaveBox.width),
  ).toBeGreaterThanOrEqual(32);

  await save.click();
  await expect(save).toHaveCount(0);
  await expect(
    page.getByText('Settings saved.', { exact: true }),
  ).toBeVisible();
});

test('primary pages reserve a stable root scrollbar gutter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await openDemoPage(page, '/?demo=1');
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
  await waitForAppEntrance(page);
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

test('desktop sidebar connection status fits and stays meaningful when collapsed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 620 });
  await openLiveDemo(page);
  const sidebar = page.locator('aside');
  const home = sidebar.getByRole('link', { name: 'Fennec home' });
  const brandRow = home.locator('..');
  const mark = home.locator('img');
  const brandName = home.getByText('Fennec', { exact: true });
  const collapseButton = sidebar.getByRole('button', {
    name: 'Collapse sidebar',
  });
  const status = sidebar.getByRole('status');
  await expect(mark).toBeVisible();
  await expect(brandName).toBeVisible();
  await expect(brandRow.getByRole('button')).toHaveCount(0);
  const [expandedMarkBox, expandedSidebarBox, brandRowBox, collapseButtonBox] =
    await Promise.all([
      mark.boundingBox(),
      sidebar.boundingBox(),
      brandRow.boundingBox(),
      collapseButton.boundingBox(),
    ]);
  expect(expandedMarkBox).toMatchObject({ width: 44, height: 44 });
  expect(collapseButtonBox!.y + collapseButtonBox!.height / 2).toBeCloseTo(
    brandRowBox!.y + brandRowBox!.height,
    0,
  );
  expect(collapseButtonBox!.x).toBeLessThan(
    expandedSidebarBox!.x + expandedSidebarBox!.width,
  );
  expect(collapseButtonBox!.x + collapseButtonBox!.width).toBeGreaterThan(
    expandedSidebarBox!.x + expandedSidebarBox!.width,
  );
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute(
    'aria-label',
    /^Connection status: Demo · /,
  );
  await expect(status).toHaveAttribute('data-connection-state', 'live');
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

  const expandedState = await status.getAttribute('data-connection-state');
  const expandedIndicatorClass = await status
    .locator('[aria-hidden="true"]')
    .getAttribute('class');
  const expandedHeight = (await status.boundingBox())!.height;
  await collapseButton.click();

  await expect(brandName).toBeHidden();
  const collapsedMarkBox = await mark.boundingBox();
  expect(collapsedMarkBox).toMatchObject({
    width: expandedMarkBox!.width,
    height: expandedMarkBox!.height,
  });
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute(
    'aria-label',
    /^Connection status: Demo · /,
  );
  await expect(status).toHaveAttribute('data-connection-state', expandedState!);
  await expect(status).toHaveText('');
  await expect(status.locator('[aria-hidden="true"]')).toHaveAttribute(
    'class',
    expandedIndicatorClass!,
  );
  expect((await status.boundingBox())!.height).toBe(expandedHeight);
});

test('scoreboard columns align and the desktop timeline scrolls independently', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 780 });
  await openLiveDemo(page);
  const scoreHeader = page
    .getByRole('columnheader', {
      name: 'Score',
      exact: true,
    })
    .first();
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
    page.getByRole('columnheader', { name: 'Goals', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Passes', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '50s', exact: true }).first(),
  ).toBeVisible();
  const timelineScroller = page.locator('.timeline-scroller');
  expect(
    await timelineScroller.evaluate(
      (element) => getComputedStyle(element).overflowY,
    ),
  ).toBe('auto');
});

test('wide split-layout scoreboards preserve readable player names', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await openLiveDemo(page);
  const scoreboardScroller = page.locator('.scoreboard-scroller');
  const dimensions = () =>
    scoreboardScroller.evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
  const expectScoreboardToFit = async () => {
    const value = await dimensions();
    expect(value.scroll).toBeLessThanOrEqual(value.client);
  };

  for (const label of ['S', 'G', 'A', 'P', '50', 'SV', 'SH', 'T', 'D'])
    await expect(
      page.getByRole('columnheader', { name: label, exact: true }),
    ).toHaveCount(2);
  await expect(
    page.getByRole('columnheader', { name: 'CT', exact: true }),
  ).toHaveCount(0);

  const expandedDimensions = await dimensions();
  expect(expandedDimensions.scroll).toBeGreaterThan(expandedDimensions.client);

  const name = page
    .getByRole('row')
    .filter({ has: page.getByText('YOU', { exact: true }) })
    .locator('strong');
  await name.evaluate((element) => {
    element.textContent = 'An extraordinarily long Rocket League player name';
  });
  const nameDimensions = await name.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(nameDimensions.client).toBeGreaterThanOrEqual(112);
  expect(nameDimensions.scroll).toBeGreaterThan(nameDimensions.client);

  await page.setViewportSize({ width: 1440, height: 780 });
  await expectScoreboardToFit();

  await page.setViewportSize({ width: 1280, height: 780 });

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator('aside').boundingBox())?.width)
    .toBeCloseTo(76, 0);
  await expectScoreboardToFit();
});

test('scrollable areas use compact theme-aware scrollbars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 620 });
  await openLiveDemo(page);
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
  await openLiveDemo(page);
  const scoreboardScroller = page.locator('.scoreboard-scroller');
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
  const [scrollerBox, scoreBoxes] = await Promise.all([
    scoreboardScroller.boundingBox(),
    page
      .locator('.scoreboard-team-score')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON()),
      ),
  ]);
  expect(scoreBoxes).toHaveLength(2);
  for (const scoreBox of scoreBoxes) {
    expect(scoreBox.x).toBeGreaterThanOrEqual(scrollerBox!.x);
    expect(scoreBox.right).toBeLessThanOrEqual(
      scrollerBox!.x + scrollerBox!.width,
    );
  }
});

test('auto-open navigates to the live monitor by default', async ({ page }) => {
  await openLiveDemo(page, '/settings?demo=1');
});

test('auto-open does not take an active match away from setup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('fennec-setup-path-explicit-v2', 'browser');
  });
  await page.goto('/setup?demo=1');

  await expect(
    page.getByRole('heading', { name: 'Connect Fennec' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Live (match|training)/ }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/setup\?demo=1$/);
});
