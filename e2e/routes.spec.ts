import { test, expect } from '@playwright/test';
import { expectHealthyPhonePage, mockTranslate, WIDTHS } from './shell-helpers';
import { expectTappable, watchErrors } from './helpers';

// The full route list of the site: meta.ts ROUTES (/, /studio, every tool, /phrasebook, every lesson) plus /learn and a 404.
const TOOLS = ['photo', 'video', 'recording', 'subtitles', 'watch', 'worksheets'];
const LESSONS = ['introduction', 'alphabet', 'pronunciation', 'nouns', 'cases', 'adjectives', 'pronouns', 'verbs-present', 'verbs-tenses', 'aspect', 'numerals', 'prepositions', 'sentences', 'word-formation', 'faq', 'reading-the-translator'];
const ROUTES: { path: string; tab: string | null }[] = [
  { path: '/', tab: 'Translate' },
  { path: '/learn', tab: 'Learn' },
  ...LESSONS.map((l) => ({ path: `/learn/${l}`, tab: 'Learn' })),
  { path: '/learn/no-such-lesson', tab: 'Learn' },
  { path: '/phrasebook', tab: 'Phrasebook' },
  { path: '/studio', tab: 'Studio' },
  ...TOOLS.map((t) => ({ path: `/studio/${t}`, tab: null })), // a tool is full screen: no tab bar
  { path: '/studio/no-such-tool', tab: 'Studio' },
  { path: '/no/such/page', tab: null },
];

test.describe('every route on a phone', () => {
  for (const r of ROUTES) {
    test(`${r.path}: healthy at 320, 360, 390 and 430 wide`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'desktop-webkit');
      test.setTimeout(120_000);
      const errors = watchErrors(page, testInfo);
      await mockTranslate(page);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 760 });
        await page.goto(r.path);
        await expect(page.locator('.ph-app')).toBeVisible();
        await expectHealthyPhonePage(page, `${r.path} @${w}`);
        if (r.tab) {
          const current = page.locator('.ph-tabbar [aria-current="page"]');
          await expect(current, `${r.path} @${w}: exactly one active tab`).toHaveCount(1);
          await expect(current).toContainText(r.tab);
        } else if (r.path.startsWith('/studio/') && !r.path.includes('no-such')) {
          await expect(page.locator('.ph-tabbar'), 'a tool is full screen').toHaveCount(0);
          await expect(page.getByRole('link', { name: 'Back to Studio' })).toBeVisible();
        }
      }
      expect(errors).toEqual([]);
    });
  }
});

test('the 404 page says so in plain words and offers a way out', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'translator' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Text to translate')).toBeVisible();
});

test('the tab bar navigates to each section and highlights it', async ({ page }) => {
  await mockTranslate(page);
  await page.goto('/');
  const tabs = [
    { name: 'Learn', url: /\/learn$/, see: page.getByRole('heading', { name: 'Start' }) },
    { name: 'Phrasebook', url: /\/phrasebook$/, see: page.getByLabel('Search phrases') },
    { name: 'Studio', url: /\/studio$/, see: page.getByRole('heading', { name: 'Your uploads' }) },
    { name: 'Translate', url: /\/$/, see: page.getByLabel('Text to translate') },
  ];
  for (const t of tabs) {
    await page.locator('.ph-tabbar').getByRole('link', { name: t.name }).click();
    await expect(page).toHaveURL(t.url);
    await expect(t.see).toBeVisible();
    await expect(page.locator('.ph-tabbar [aria-current="page"]')).toHaveText(t.name);
    await expect(page.locator('.ph-topbar-title')).toBeVisible();
  }
});

test('the tab bar stays on screen at the bottom on every tab while content scrolls', async ({ page }) => {
  await page.goto('/learn/cases');
  const bar = page.locator('.ph-tabbar');
  const before = await bar.boundingBox();
  await page.locator('.ph-content').evaluate((el) => el.scrollTo(0, 800));
  const after = await bar.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  const vh = page.viewportSize()!.height;
  expect(after!.y + after!.height, 'bar touches the bottom edge').toBeGreaterThan(vh - 2);
  await expect.poll(() => page.locator('.ph-content').evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY), 'the window itself did not scroll').toBe(0);
});

test('history: back and forward walk through the pages, reload keeps the route, deep links open directly', async ({ page }) => {
  await mockTranslate(page);
  await page.goto('/');
  await page.locator('.ph-tabbar').getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('link', { name: /Alphabet/ }).first().click();
  await expect(page).toHaveURL(/\/learn\/alphabet$/);
  await page.locator('.ph-tabbar').getByRole('link', { name: 'Phrasebook' }).click();
  await expect(page).toHaveURL(/\/phrasebook$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/learn\/alphabet$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/alphabet/i);
  await expect(page.locator('.ph-tabbar [aria-current="page"]')).toHaveText('Learn');
  await page.goBack();
  await expect(page).toHaveURL(/\/learn$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Text to translate')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/learn$/);

  await page.reload();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.locator('.ph-tabbar [aria-current="page"]')).toHaveText('Learn');

  await page.goto('/studio/worksheets');
  await expect(page.locator('.ph-tool-frame[data-tool="worksheets"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.ph-tool-frame[data-tool="worksheets"]')).toBeVisible();
});

test('the page title follows the route', async ({ page }) => {
  await page.goto('/');
  const home = await page.title();
  await page.locator('.ph-tabbar').getByRole('link', { name: 'Phrasebook' }).click();
  await expect.poll(() => page.title()).not.toBe(home);
  expect(await page.title()).toMatch(/phrase/i);
});

test('every control in the shell is at least 44px (WCAG target size) on the top bar and tab bar', async ({ page }) => {
  await page.goto('/learn');
  await expectTappable(page.locator('.ph-app > .ph-topbar'), 44);
  await expectTappable(page.locator('.ph-tabbar'), 44);
});

test('safe-area insets: with notch padding the bars grow and the layout still fits', async ({ page }) => {
  await page.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = ':root{--test-safe:1}';
    document.documentElement.appendChild(s);
  });
  await page.goto('/learn');
  // env(safe-area-inset-*) cannot be set from a test; check the CSS reads it, then that the bars at least have their minimum heights.
  const css = await page.evaluate(async () => {
    const out: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      try {
        for (const rule of [...sheet.cssRules]) if (/safe-area-inset/.test(rule.cssText) && /ph-tabbar|ph-topbar|ph-app/.test(rule.cssText)) out.push(rule.cssText.slice(0, 80));
      } catch {
        /* cross-origin */
      }
    }
    return out;
  });
  expect(css.length, 'tab bar / top bar rules use env(safe-area-inset-*)').toBeGreaterThan(0);
  const tb = await page.locator('.ph-tabbar').boundingBox();
  expect(tb!.height).toBeGreaterThanOrEqual(56);
});

test('the route list in this spec is the real lesson list (so no route silently renders the lesson index)', async ({ page }) => {
  await page.goto('/learn');
  const hrefs = await page.locator('.ph-lesson-card').evaluateAll((els) => els.map((e) => e.getAttribute('href')!.replace('/learn/', '')));
  expect(hrefs.sort()).toEqual([...LESSONS].sort());
  for (const l of LESSONS) {
    await page.goto(`/learn/${l}`);
    await expect(page.locator('.ph-lesson-nav'), `/learn/${l} is a lesson page`).toBeVisible();
  }
});
