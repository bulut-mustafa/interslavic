import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectShellStill, expectTappable, iosKeyboard, watchErrors } from './helpers';
import { fakeVoices, mockTranslate } from './shell-helpers';

const TOPICS = ['Hello and goodbye', 'Being polite', 'About yourself', 'Finding your way', 'Food and shopping', 'Help', 'Celebrations'];
const rows = (page: Page) => page.locator('.ph-phrase');
const sheet = (page: Page) => page.locator('.ph-sheet[data-open="true"]');
const search = (page: Page) => page.getByLabel('Search phrases');

test.beforeEach(async ({ page }) => {
  await mockTranslate(page);
});

test('list: every topic is a section with phrase rows (Interslavic big, English under), no errors', async ({ page }, testInfo) => {
  const errors = watchErrors(page, testInfo);
  await page.goto('/phrasebook');
  await expect(page.locator('.ph-section-title')).toHaveText(TOPICS);
  await expect(page.locator('section[aria-label]').filter({ has: page.locator('.ph-phrase') })).toHaveCount(TOPICS.length);
  const first = rows(page).first();
  await expect(first.locator('.ph-phrase-isv')).toHaveText('Dobry denj!');
  await expect(first.locator('.ph-phrase-en')).toContainText('Good day');
  expect(await rows(page).count()).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('every phrase row is a full-width 48px+ tap target', async ({ page }) => {
  await page.goto('/phrasebook');
  await expectTappable(page.locator('.ph-phrasebook'), 40);
  const b = (await rows(page).first().boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(48);
  expect(b.width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
});

test('search filters live by Interslavic, by English and by Cyrillic, and clears back', async ({ page }) => {
  await page.goto('/phrasebook');
  const all = await rows(page).count();
  await search(page).fill('morning');
  await expect(page.locator('.ph-section-title').first()).toBeVisible();
  const n = await rows(page).count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all);
  for (const t of await rows(page).allTextContents()) expect(t.toLowerCase()).toContain('morning');
  await expect(rows(page).first()).toContainText('Dobro utro!');
  // Interslavic search
  await search(page).fill('dobry večer');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Dobry večer!');
  // Cyrillic search
  await search(page).fill('Добро утро');
  await expect(rows(page).first()).toContainText('Dobro utro!');
  // topic headings of empty groups disappear
  await expect(page.locator('.ph-section-title')).toHaveCount(1);
  await search(page).fill('');
  await expect(rows(page)).toHaveCount(all);
});

test('search with no match says so in plain words, and the query is shown', async ({ page }) => {
  await page.goto('/phrasebook');
  await search(page).fill('zzzzqq');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText(/No phrase matches/)).toContainText('zzzzqq');
});

test('the search field is 16px+ and stays visible; typing with the iOS keyboard open keeps the shell still', async ({ page }) => {
  await page.goto('/phrasebook');
  const fs = await search(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  await search(page).focus();
  await iosKeyboard(page, 300);
  await search(page).fill('good');
  await expectShellStill(page);
  const vvh = await page.evaluate(() => visualViewport!.height);
  const b = (await search(page).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vvh);
  expect((await page.locator('.ph-app > .ph-topbar').boundingBox())!.y, 'top bar did not slide away').toBe(0);
});

test('topic chips: choosing one shows only that topic, All brings everything back; the chosen chip is pressed', async ({ page }) => {
  await page.goto('/phrasebook');
  const chips = page.getByRole('group', { name: 'Topic' });
  await expectTappable(chips, 40);
  await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  const all = await rows(page).count();
  await chips.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(chips.getByRole('button', { name: 'Help', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.ph-section-title')).toHaveText(['Help']);
  const n = await rows(page).count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all);
  // topic + search combine
  await search(page).fill('zzzz');
  await expect(rows(page)).toHaveCount(0);
  await search(page).fill('');
  await chips.getByRole('button', { name: 'All' }).click();
  await expect(rows(page)).toHaveCount(all);
});

test('topic chips can be scrolled to the last one (the row scrolls, the page does not)', async ({ page }) => {
  await page.goto('/phrasebook');
  const chips = page.getByRole('group', { name: 'Topic' });
  await chips.evaluate((el) => el.scrollTo(9999, 0));
  await expectShellStill(page);
  const last = chips.getByRole('button', { name: 'Celebrations', exact: true });
  await expect(last).toBeInViewport();
  await last.click();
  await expect(page.locator('.ph-section-title')).toHaveText(['Celebrations']);
});

test('phrase sheet: tapping a phrase opens it with Latin, Cyrillic, English, actions and the source link', async ({ page }, testInfo) => {
  const errors = watchErrors(page, testInfo);
  await fakeVoices(page);
  await page.goto('/phrasebook');
  await rows(page).first().click();
  const dlg = page.getByRole('dialog', { name: 'Phrase' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.ph-sheet-isv')).toHaveText('Dobry denj!');
  await expect(dlg.locator('.ph-sheet-cyr')).toHaveText('Добры дењ!');
  await expect(dlg).toContainText('Good day');
  await expect(dlg.getByRole('button', { name: /Copy/ })).toBeVisible();
  await expect(dlg.getByRole('button', { name: /Speak|Stop/ }), 'speak button present').toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Save to Anki' })).toBeVisible();
  const src = dlg.getByRole('link', { name: /Source: Tatoeba 12977822/ });
  await expect(src).toHaveAttribute('href', /tatoeba\.org.*12977822/);
  await expectTappable(dlg.locator('.ph-sheet-row'), 44);
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phrase sheet: Speak reads the Interslavic phrase with the reference voice and turns into Stop', async ({ page }) => {
  await fakeVoices(page);
  await page.goto('/phrasebook');
  await rows(page).first().click();
  await page.getByRole('button', { name: 'Speak' }).click();
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toEqual(['Dobry denj!']);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();
});

test('phrase sheet: with no voice installed there is no dead Speak button, the other actions remain', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], addEventListener: () => undefined, removeEventListener: () => undefined, cancel: () => undefined, speak: () => undefined } });
  });
  await page.goto('/phrasebook');
  await rows(page).first().click();
  await expect(page.getByRole('button', { name: 'Save to Anki' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Speak|Stop/ })).toHaveCount(0);
});

test('phrase sheet: a dictionary phrase credits the dictionary', async ({ page }) => {
  await page.goto('/phrasebook');
  await page.getByRole('button', { name: /^Dobra noč!/ }).click();
  await expect(page.getByRole('link', { name: 'Source: the Interslavic dictionary' })).toBeVisible();
});

test('phrase sheet: Copy puts the Interslavic phrase on the clipboard and says Copied (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'needs the clipboard');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/phrasebook');
  await rows(page).first().click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Dobry denj!');
});

test('phrase sheet: Copy does not throw where the clipboard is refused', async ({ page }, testInfo) => {
  const errors = watchErrors(page, testInfo);
  await page.goto('/phrasebook');
  await rows(page).first().click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('phrase sheet: Save to Anki downloads a tab-separated file with that one phrase', async ({ page }) => {
  await page.goto('/phrasebook');
  await rows(page).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save to Anki' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('interslavic-phrase-anki.txt');
  const path = await d.path();
  const text = readFileSync(path, 'utf8');
  expect(text).toContain('Dobry denj!');
  expect(text).toContain('\t');
  expect(text.match(/Dobry denj!/g)!.length).toBe(1);
  expect(text, 'only the chosen phrase, not the whole book').not.toContain('Dobro utro!');
});

test('menu: "Export all for Anki" opens a sheet; both card directions download the whole book', async ({ page }) => {
  await page.goto('/phrasebook');
  await page.getByRole('button', { name: 'Menu' }).click();
  await sheet(page).getByRole('button', { name: 'Export all for Anki' }).click();
  const dlg = page.getByRole('dialog', { name: 'Export for Anki' });
  await expect(dlg).toBeVisible();
  const select = dlg.getByLabel('Card shows');
  expect(await select.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 'select 16px+').toBeGreaterThanOrEqual(16);
  const dl = page.waitForEvent('download');
  await dlg.getByRole('button', { name: 'Download for Anki' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('interslavic-phrasebook-anki.txt');
  const first = readFileSync((await d.path())!, 'utf8');
  expect(first).toContain('Dobry denj!');
  expect(first).toContain('Dobro utro!');
  await select.selectOption('en-isv');
  const dl2 = page.waitForEvent('download');
  await dlg.getByRole('button', { name: 'Download for Anki' }).click();
  const second = readFileSync((await (await dl2).path())!, 'utf8');
  expect(second, 'the direction changes the file').not.toBe(first);
});

test('menu: flashcards - tap reveals the meaning, Next/Previous cycle, count follows, back to the list', async ({ page }) => {
  await page.goto('/phrasebook');
  await page.getByRole('button', { name: 'Menu' }).click();
  await sheet(page).getByRole('button', { name: 'Practise as flashcards' }).click();
  const card = page.locator('.ph-flash');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Tap to see the meaning');
  const isv = await card.locator('.ph-sheet-isv').textContent();
  await card.click();
  await expect(card.locator('.ph-flash-en')).not.toHaveText('Tap to see the meaning');
  const bar = page.getByRole('toolbar', { name: 'Flashcards' });
  const total = Number((await bar.locator('.ph-flash-count').textContent())!.match(/of (\d+)/)![1]);
  await expect(bar.locator('.ph-flash-count')).toHaveText(`1 of ${total}`);
  await bar.getByRole('button', { name: /Next/ }).click();
  await expect(bar.locator('.ph-flash-count')).toHaveText(`2 of ${total}`);
  await expect(card.locator('.ph-flash-en'), 'a new card hides its meaning').toHaveText('Tap to see the meaning');
  await expect(card.locator('.ph-sheet-isv')).not.toHaveText(isv!);
  await bar.getByRole('button', { name: 'Previous' }).click();
  await expect(card.locator('.ph-sheet-isv')).toHaveText(isv!);
  await bar.getByRole('button', { name: 'Previous' }).click();
  await expect(bar.locator('.ph-flash-count'), 'wraps around').toHaveText(`${total} of ${total}`);
  await expectTappable(bar, 44);
  await expectShellStill(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await sheet(page).getByRole('button', { name: 'Back to the phrase list' }).click();
  await expect(rows(page).first()).toBeVisible();
});

test('flashcards respect the topic filter', async ({ page }) => {
  await page.goto('/phrasebook');
  await page.getByRole('group', { name: 'Topic' }).getByRole('button', { name: 'Help', exact: true }).click();
  const n = await rows(page).count();
  await page.getByRole('button', { name: 'Menu' }).click();
  await sheet(page).getByRole('button', { name: 'Practise as flashcards' }).click();
  await expect(page.locator('.ph-flash-count')).toHaveText(`1 of ${n}`);
});
