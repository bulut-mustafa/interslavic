import { test, expect, type Page } from '@playwright/test';
import { expectShellStill, watchErrors } from './helpers';
import { dragElement, grantClipboard, mockTranslate, pageFacts } from './shell-helpers';

const sheet = (page: Page) => page.locator('.ph-sheet[data-open="true"]');
const openMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toHaveAttribute('data-open', 'true');
};
const closedAfter = async (page: Page) => {
  await expect(page.locator('.ph-sheet[data-open="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
};

test.describe('the page checks themselves can fail (so the route specs mean something)', () => {
  test('a wide element, a 12px textarea and a sideways scroll are detected', async ({ page }) => {
    await page.goto('/learn');
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText = 'width:900px;height:20px;background:red';
      d.className = 'injected-wide';
      document.querySelector('.ph-content')!.appendChild(d);
      const i = document.createElement('textarea');
      document.documentElement.classList.remove('ph-locked'); // the app forces 16px under this class; the check must still see a small one
      i.style.fontSize = '12px';
      i.setAttribute('aria-label', 'tiny');
      document.querySelector('.ph-content')!.appendChild(i);
    });
    const f = await pageFacts(page);
    expect(f.off.join(' ')).toContain('injected-wide');
    expect(f.small.join(' ')).toContain('tiny');
  });
});

test.describe('shell', () => {
  test('the phone shell is a locked 100svh grid: top bar, scrolling content, tab bar', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockTranslate(page);
    await page.goto('/learn/cases');
    await expect(page.locator('html')).toHaveClass(/ph-locked/);
    const app = await page.locator('.ph-app').boundingBox();
    const vp = page.viewportSize()!;
    expect(app!.x).toBe(0);
    expect(app!.width).toBeCloseTo(vp.width, 0);
    const top = await page.locator('.ph-app > .ph-topbar').boundingBox();
    const bar = await page.locator('.ph-tabbar').boundingBox();
    const content = await page.locator('.ph-content').boundingBox();
    expect(top!.y).toBe(0);
    expect(content!.y).toBeGreaterThanOrEqual(top!.y + top!.height - 1);
    expect(content!.y + content!.height).toBeLessThanOrEqual(bar!.y + 1);
    await page.locator('.ph-content').evaluate((el) => el.scrollTo(0, 5000));
    await expectShellStill(page);
    expect(await page.locator('.ph-content').evaluate((el) => el.scrollTop), 'the content scroller scrolls').toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test('desktop layout is not used: no site header, no footer, no desktop nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sitenav, .topbar, .site-footer')).toHaveCount(0);
  });

  test('the top bar title follows the section', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('.ph-topbar-title');
    await expect(title).toHaveText('Medžuslovjansky');
    await page.locator('.ph-tabbar').getByRole('link', { name: 'Learn' }).click();
    await expect(title).toHaveText('Learn');
    await page.locator('.ph-tabbar').getByRole('link', { name: 'Phrasebook' }).click();
    await expect(title).toHaveText('Phrasebook');
    await page.locator('.ph-tabbar').getByRole('link', { name: 'Studio' }).click();
    await expect(title).toHaveText('Studio');
  });

  test('the tab bar does not move when the iOS-style keyboard opens in the translator', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    const before = await page.locator('.ph-tabbar').boundingBox();
    await page.getByLabel('Text to translate').focus();
    await page.waitForTimeout(300);
    await expectShellStill(page);
    const topbar = await page.locator('.ph-app > .ph-topbar').boundingBox();
    expect(topbar!.y).toBe(0);
    const after = await page.locator('.ph-tabbar').boundingBox();
    expect(Math.abs(after!.y - before!.y), 'tab bar jumped').toBeLessThan(2);
  });
});

test.describe('menu sheet', () => {
  test.beforeEach(async ({ page }) => {
    await mockTranslate(page);
    await grantClipboard(page);
  });

  test('opens from the top bar button with the credits, closes with its Close button', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.locator('.ph-sheet')).toHaveCount(0);
    await openMenu(page);
    await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText(/Menu|About/);
    await expect(sheet(page).locator('.ph-menu')).toBeVisible();
    const box = await sheet(page).boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box!.y + box!.height, 'sheet sits on the bottom edge').toBeGreaterThanOrEqual(vp.height - 2);
    await sheet(page).getByRole('button', { name: 'Close' }).click();
    await closedAfter(page);
  });

  test('the Menu button toggles it', async ({ page }) => {
    await page.goto('/learn');
    await openMenu(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await closedAfter(page);
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto('/learn');
    await openMenu(page);
    await page.keyboard.press('Escape');
    await closedAfter(page);
  });

  test('dragging the grabber down closes it', async ({ page }) => {
    await page.goto('/learn');
    await openMenu(page);
    await dragElement(page, '.ph-sheet[data-open="true"] .ph-sheet-grabber', 400);
    await closedAfter(page);
  });

  test('a short drag on the grabber does not close it (snaps back)', async ({ page }) => {
    await page.goto('/learn');
    await openMenu(page);
    await dragElement(page, '.ph-sheet[data-open="true"] .ph-sheet-grabber', 12, 6);
    await page.waitForTimeout(400);
    await expect(sheet(page)).toBeVisible();
  });

  test('the sheet is non-modal by design: tapping the page behind it does not close it, and there is no scrim', async ({ page }) => {
    await page.goto('/learn');
    await openMenu(page);
    expect(await page.locator('.ph-scrim, .ph-backdrop').count(), 'no scrim element').toBe(0);
    await page.locator('.ph-topbar-title').click({ force: true });
    await expect(sheet(page)).toBeVisible();
  });

  test('menu items belong to the screen: Translator offers copy link, report and options; Learn offers report', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    await expect(sheet(page).getByRole('button', { name: 'Voice and colour key' })).toBeVisible();
    // empty text: there is nothing to link to or report yet
    await expect(sheet(page).getByRole('button', { name: 'Copy link to this translation' })).toHaveCount(0);
    await expect(sheet(page).getByRole('button', { name: 'Report a problem' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByLabel('Text to translate').fill('Good morning, my friend');
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
    await openMenu(page);
    await expect(sheet(page).getByRole('button', { name: 'Copy link to this translation' })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Report a problem' })).toBeVisible();
    await page.keyboard.press('Escape');
    await closedAfter(page);

    await page.locator('.ph-tabbar').getByRole('link', { name: 'Learn' }).click();
    await openMenu(page);
    await expect(sheet(page).getByRole('button', { name: 'Copy link to this translation' }), 'translator items are gone on Learn').toHaveCount(0);
    await expect(sheet(page).getByRole('button', { name: 'Voice and colour key' })).toHaveCount(0);
  });

  test('picking a menu item closes the menu and opens the next sheet: only one sheet at a time', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    await sheet(page).getByRole('button', { name: 'Voice and colour key' }).click();
    await expect(page.locator('.ph-sheet[data-open="true"]')).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'Options' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Menu|About/ })).toHaveCount(0);
  });

  test('going back in history while the menu is open closes it (it must not stay over the previous page)', async ({ page }) => {
    await page.goto('/learn');
    await page.locator('.ph-tabbar').getByRole('link', { name: 'Phrasebook' }).click();
    await expect(page).toHaveURL(/phrasebook/);
    await openMenu(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/learn$/);
    await closedAfter(page);
  });
});

// ---- desktop: the phone work must not have changed the desktop layout ----
test.describe('desktop layout is intact @desktop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-webkit', 'desktop only');
    await mockTranslate(page);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  const noPhone = async (page: Page) => {
    await expect(page.locator('.ph-app, .ph-tabbar, .ph-topbar, .ph-sheet')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.classList.contains('ph-locked')), 'page is not scroll-locked').toBe(false);
    const f = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(f.sw, 'no sideways scroll').toBeLessThanOrEqual(f.cw + 1);
  };

  for (const [path, nav] of [['/', 'Translate'], ['/learn/nouns', 'Learn'], ['/phrasebook', 'Phrasebook']] as const) {
    test(`${path}: site header with the four sections, current one marked, footer, no phone shell @desktop`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.goto(path);
      await noPhone(page);
      const links = page.getByRole('navigation', { name: 'Site' }).getByRole('link');
      await expect(links).toHaveText(['Translate', 'Learn', 'Phrasebook', 'Studio']);
      await expect(links.filter({ hasText: nav })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.site-footer')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('/: the translator translates on its own (debounced) with no Translate button needed @desktop', async ({ page }) => {
    const api = await mockTranslate(page);
    await page.goto('/');
    await page.getByLabel('Text to translate').fill('Good morning, my friend');
    await expect.poll(() => api.calls.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.locator('.ph-sticky, .ph-kbar, .pt')).toHaveCount(0);
  });

  test('/learn: the lesson sidebar and "On this page" are there, no phone cards @desktop', async ({ page }) => {
    await page.goto('/learn/nouns');
    await expect(page.locator('.learn')).toBeVisible();
    await expect(page.locator('.ph-lesson-card, .ph-scrollcard, .ph-lesson-nav')).toHaveCount(0);
    await expect(page.locator('.prevnext')).toBeVisible();
    await expect(page.locator('.toc')).toBeVisible();
  });

  test('top bar navigation works without reload @desktop', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => ((window as unknown as { __alive: number }).__alive = 1));
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Phrasebook' }).click();
    await expect(page).toHaveURL(/\/phrasebook$/);
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive), 'a reload happened').toBe(1);
  });

  for (const slug of ['', 'photo', 'video', 'worksheets']) {
    test(`/studio${slug ? '/' + slug : ''}: the Studio rail, bar and workspace, no phone shell @desktop`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.goto(`/studio${slug ? '/' + slug : ''}`);
      await noPhone(page);
      await expect(page.locator('.studio-rail')).toBeVisible();
      await expect(page.locator('.studio-bar')).toBeVisible();
      const rail = (await page.locator('.studio-rail').boundingBox())!;
      expect(rail.x).toBe(0);
      expect(rail.width).toBeGreaterThan(100);
      expect(rail.width).toBeLessThan(400);
      const nav = page.getByRole('navigation', { name: 'Tools' });
      for (const t of ['Photo', 'Video', 'Recording', 'Subtitles', 'Watch', 'Worksheets']) await expect(nav.getByRole('link', { name: new RegExp(t) })).toBeVisible();
      if (slug) {
        await expect(page.locator('.tool-pane:not([hidden])')).toBeVisible();
        await expect(nav.locator('.is-current')).toContainText(new RegExp(slug, 'i'));
      } else {
        await expect(page.locator('.studio-home')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }

  test('/studio/photo: rail links switch tools without a reload @desktop', async ({ page }) => {
    await page.goto('/studio/photo');
    await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: /Worksheets/ }).click();
    await expect(page).toHaveURL(/\/studio\/worksheets$/);
    await expect(page.locator('.tool-pane:not([hidden])')).toBeVisible();
  });

  test('resizing from desktop down to a phone width switches to the phone shell and back @desktop', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.locator('.ph-app')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.locator('.ph-app')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.ph-app')).toHaveCount(0);
    await expect(page.locator('.sitenav')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/ph-locked/);
  });
});
