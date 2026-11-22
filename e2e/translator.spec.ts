import { test, expect, type Page } from '@playwright/test';
import { expectNotCovered, expectShellStill, expectTappable, iosKeyboard, watchErrors } from './helpers';
import { grantClipboard, mockTranslate } from './shell-helpers';

const TEXT = 'Good morning, my friend';
const input = (page: Page) => page.getByLabel('Text to translate');
const sheet = (page: Page) => page.locator('.ph-sheet[data-open="true"]');

async function translate(page: Page, text = TEXT) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
}

test.describe('translator on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await grantClipboard(page);
  });

  test('empty state: hint card, Translate disabled until there is text, no request made', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockTranslate(page);
    await page.goto('/');
    await expect(page.getByText('Type or paste a sentence, then tap Translate')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeDisabled();
    await input(page).fill('   ');
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeDisabled();
    await input(page).fill('Hello');
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeEnabled();
    await page.waitForTimeout(700);
    expect(api.calls, 'typing alone must not call the API on a phone').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('typing then tapping Translate shows one card per sentence with the real engine words, plus the other script', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    const card = page.getByRole('article', { name: 'Translation 1' });
    await expect(card.locator('.output-word')).toHaveText(['Dobro', 'utro,', 'moj', 'prijatelj']);
    await expect(card.getByLabel('The same text in the other script')).toContainText('Добро утро');
    // one request carries both scripts, the chosen one first
    expect(api.calls.map((c) => [c.orthography, c.alternate])).toEqual([['standard', 'cyrillic']]);
    expect(api.calls[0]).toMatchObject({ text: TEXT, lang: 'en' });
    await expect(page.getByText(/words found in the lexicon/)).toBeVisible();
    await expect(page.getByText(/^4 of 4 words found|of 4 words found/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the result is brought into view and the shell does not move', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeInViewport();
    await expectShellStill(page);
  });

  test('Translate shows busy state while waiting and cannot be double-sent', async ({ page }) => {
    const api = await mockTranslate(page, { delayMs: 800 });
    await page.goto('/');
    await input(page).fill(TEXT);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    const busy = page.getByRole('button', { name: 'Translating…' });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
    expect(api.calls.length, 'one request, carrying both scripts').toBe(1);
  });

  test('Translate button is sticky: visible above the tab bar even when the page is scrolled to the end of a long result', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.locator('.ph-content').evaluate((el) => el.scrollTo(0, 99999));
    const btn = page.getByRole('button', { name: 'Translate', exact: true });
    await expect(btn).toBeInViewport({ ratio: 1 });
    await expectNotCovered(btn);
    const b = (await btn.boundingBox())!;
    const bar = (await page.locator('.ph-tabbar').boundingBox())!;
    expect(b.y + b.height, 'above the tab bar').toBeLessThanOrEqual(bar.y + 1);
    expect(b.height, 'tappable').toBeGreaterThanOrEqual(44);
  });

  test('with the iOS keyboard open (300px) the Translate button sits right above it, visible and tappable, and nothing shifts', async ({ page }) => {
    const api = await mockTranslate(page);
    await page.goto('/');
    await input(page).focus();
    await input(page).fill(TEXT);
    const topBefore = (await page.locator('.ph-app > .ph-topbar').boundingBox())!;
    await iosKeyboard(page, 300);
    const btn = page.getByRole('button', { name: 'Translate', exact: true });
    await expect(btn).toBeVisible();
    const vv = await page.evaluate(() => ({ h: visualViewport!.height, ih: innerHeight }));
    expect(vv.h).toBeLessThan(vv.ih - 250);
    const b = (await btn.boundingBox())!;
    expect(b.y + b.height, 'button above the keyboard edge').toBeLessThanOrEqual(vv.h + 1);
    expect(b.y, 'button on screen').toBeGreaterThan(0);
    await expectNotCovered(btn);
    await expectShellStill(page);
    const topAfter = (await page.locator('.ph-app > .ph-topbar').boundingBox())!;
    expect(topAfter.y, 'top bar did not slide away').toBeCloseTo(topBefore.y, 0);
    expect(await page.locator('.ph-content').evaluate((el) => el.scrollLeft)).toBe(0);
    await btn.click();
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
    expect(api.calls.length).toBeGreaterThan(0);
    await iosKeyboard(page, 0);
    await expect(page.locator('.ph-sticky').getByRole('button', { name: 'Translate' })).toBeVisible();
    await expectShellStill(page);
  });

  test('tapping a word opens the word sheet with that word; Prev/Next step through words; Close closes it', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.locator('.output-word', { hasText: 'utro' }).click();
    const dlg = page.getByRole('dialog', { name: /utro/ });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('2 of 4')).toBeVisible();
    await expect(page.locator('.output-word.is-active')).toHaveText('utro,');
    await dlg.getByRole('button', { name: 'Next word' }).click();
    await expect(page.getByRole('dialog', { name: /moj/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /moj/ }).getByText('3 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Previous word' }).click();
    await page.getByRole('button', { name: 'Previous word' }).click();
    await expect(page.getByRole('dialog', { name: /dobro/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous word' }), 'no previous before the first word').toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next word' })).toBeEnabled();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next word' }).click();
    await expect(page.getByRole('button', { name: 'Next word' }), 'no next after the last word').toBeDisabled();
    await expectTappable(sheet(page).locator('.pt-stepper'), 44);
    await sheet(page).getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('.output-word.is-active')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the word sheet explains the choice (lemma, features, because) and scrolls inside itself, not the page', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.locator('.output-word', { hasText: 'Dobro' }).click();
    const body = sheet(page).locator('.ph-sheet-body');
    await expect(body).toContainText(/dobry/);
    await expect(body).toContainText(/agrees with|Case|Nominative|Nom/);
    await expectShellStill(page);
    await body.evaluate((el) => el.scrollTo(0, 9999));
    await expectShellStill(page);
  });

  test('Escape closes the word sheet; opening another sheet from the menu leaves only one', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.locator('.output-word').first().click();
    await expect(sheet(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await page.locator('.output-word').first().click();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: /Menu|About/ })).toBeVisible();
    await expect(page.locator('.ph-sheet[data-open="true"]'), 'the menu opened over the word sheet: two sheets stacked').toHaveCount(1);
  });

  test('language chips: switching language re-translates by itself and sends the new language', async ({ page }) => {
    const api = await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    api.calls.length = 0;
    await page.getByRole('group', { name: 'Language and script' }).getByRole('button', { name: 'Russian', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Russian', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => api.calls.length).toBeGreaterThan(0);
    expect(api.calls.every((c) => c.lang === 'ru')).toBe(true);
    await expect(input(page)).toHaveAttribute('placeholder', 'Введите предложение…'.replace(/…/, '…'));
  });

  test('script chips: Cyrillic is the main output and Latin the quiet second line', async ({ page }) => {
    const api = await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    api.calls.length = 0;
    await page.getByRole('button', { name: 'Cyrillic script' }).click();
    await expect(page.getByRole('button', { name: 'Cyrillic script' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Latin script' })).toHaveAttribute('aria-pressed', 'false');
    const card = page.getByRole('article', { name: 'Translation 1' });
    await expect(card.locator('.output-word').first()).toHaveText('Добро');
    await expect(card.getByLabel('The same text in the other script')).toContainText('Dobro utro');
    expect(api.calls.map((c) => [c.orthography, c.alternate])).toEqual([['cyrillic', 'standard']]);
  });

  test('the chip row scrolls inside itself, every chip is a 40px+ target, the page does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    const row = page.getByRole('group', { name: 'Language and script' });
    await expectTappable(row, 40);
    const sw = await row.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    if (page.viewportSize()!.width <= 400) expect(sw.sw, 'row wider than screen scrolls inside').toBeGreaterThan(sw.cw);
    await row.evaluate((el) => el.scrollTo(9999, 0));
    await expectShellStill(page);
    await expect(page.getByRole('button', { name: 'Options' })).toBeInViewport();
  });

  test('Options chip opens the voice and colour key sheet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: 'Language and script' }).getByRole('button', { name: 'Options' }).click();
    const dlg = page.getByRole('dialog', { name: 'Options' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('How much to trust a line')).toBeVisible();
    await dlg.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toHaveCount(0);
  });

  test('copy translation: the icon turns to "Copied" and the clipboard holds the Interslavic text', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit in Playwright has no clipboard permission; the Chromium run checks the clipboard itself');
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.getByRole('button', { name: 'Copy translation' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Dobro utro, moj prijatelj');
  });

  test('copy translation and share buttons are present and 44px (WebKit: clipboard may be refused, button must still work without errors)', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    const actions = page.locator('.pt-actions');
    await expectTappable(actions, 44);
    await expect(actions.getByRole('button', { name: /Copy translation|Copied/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Share|Link copied/ })).toBeVisible();
    await actions.getByRole('button', { name: 'Copy translation' }).click();
    expect(errors).toEqual([]);
  });

  test('menu: "Copy link to this translation" puts a link with text, lang and script into the clipboard', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'needs the clipboard');
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await sheet(page).getByRole('button', { name: 'Copy link to this translation' }).click();
    await expect(sheet(page)).toHaveCount(0);
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.searchParams.get('text')).toBe(TEXT);
    expect(link.searchParams.get('lang')).toBe('en');
    expect(link.searchParams.get('script')).toBe('standard');
  });

  test('menu: "Report a problem" opens the report form in a full sheet', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await translate(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await sheet(page).getByRole('button', { name: 'Report a problem' }).click();
    const dlg = page.getByRole('dialog', { name: 'Report a problem' });
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('textarea, input, select').first()).toBeVisible();
    await expectShellStill(page);
  });

  test('deep link /?text=...&lang=en translates by itself and fills the field', async ({ page }) => {
    const api = await mockTranslate(page);
    await page.goto(`/?lang=en&text=${encodeURIComponent(TEXT)}`);
    await expect(input(page)).toHaveValue(TEXT);
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
    expect(api.calls.length).toBeGreaterThan(0);
  });

  test('Clear text empties the field and Translate goes back to disabled', async ({ page }) => {
    await mockTranslate(page);
    await page.goto('/');
    await input(page).fill(TEXT);
    await page.getByRole('button', { name: 'Clear text' }).click();
    await expect(input(page)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeDisabled();
  });

  test('error state: a failing API shows a plain message with Try again, no raw error, and recovers', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockTranslate(page, { fail: true });
    await page.goto('/');
    await input(page).fill(TEXT);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The translator is not answering' })).toBeVisible();
    await expect(page.getByText('Please try again in a minute.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/TypeError|Failed to fetch|NetworkError|Load failed|undefined|\[object/);
    await expect(page.getByRole('article', { name: 'Translation 1' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeEnabled();
    // network back: Try again works
    await page.unroute('**/api/translate');
    await mockTranslate(page);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The translator is not answering' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('error state: a server error (500 with a JSON message) is also a plain message', async ({ page }) => {
    await mockTranslate(page, { status: 500 });
    await page.goto('/');
    await input(page).fill(TEXT);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The translator is not answering' })).toBeVisible();
  });
});
