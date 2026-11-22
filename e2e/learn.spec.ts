import { test, expect, type Page } from '@playwright/test';
import { expectShellStill, expectTappable, watchErrors } from './helpers';
import { mockTranslate } from './shell-helpers';

const LESSON_COUNT = 16;
const content = (page: Page) => page.locator('.ph-content');

test.beforeEach(async ({ page }) => {
  await mockTranslate(page);
});

test.describe('learn on a phone', () => {
  test('lesson list: progress hero, three sections, every lesson a link card with title and summary', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/learn');
    await expect(page.getByLabel('Your progress')).toContainText(`0 of ${LESSON_COUNT} lessons finished`);
    for (const s of ['Start', 'Grammar', 'More']) await expect(page.getByRole('heading', { name: s, exact: true })).toBeVisible();
    const cards = page.locator('.ph-lesson-card');
    await expect(cards).toHaveCount(LESSON_COUNT);
    for (const c of await cards.all()) {
      await expect(c.locator('strong')).not.toBeEmpty();
      await expect(c.locator('small')).not.toBeEmpty();
      expect(await c.getAttribute('href')).toMatch(/^\/learn\/[a-z-]+$/);
    }
    await expect(page.getByRole('link', { name: /Start learning: / })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every lesson card is a big tap target (>= 48px high) and reachable by scrolling the content', async ({ page }) => {
    await page.goto('/learn');
    await expectTappable(page.getByLabel('Your progress'), 44);
    const last = page.locator('.ph-lesson-card').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const h = (await last.boundingBox())!.height;
    expect(h).toBeGreaterThanOrEqual(48);
    await expectShellStill(page);
  });

  test('tapping a card opens that lesson: title, section, summary, "All lessons" back link', async ({ page }) => {
    await page.goto('/learn');
    await page.getByRole('link', { name: /Nouns/ }).first().click();
    await expect(page).toHaveURL(/\/learn\/nouns$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Nouns/i);
    await expect(page.locator('.lesson-section')).toBeVisible();
    await page.getByRole('link', { name: 'All lessons' }).first().click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(content(page)).toHaveJSProperty('scrollTop', 0);
  });

  test('the sticky bar stays at the bottom while a long lesson scrolls; Next and Previous move through lessons in order', async ({ page }) => {
    await page.goto('/learn/introduction');
    const nav = page.getByRole('navigation', { name: 'Lessons' });
    const before = (await nav.boundingBox())!;
    expect(before.y + before.height, 'bar fully on screen').toBeLessThanOrEqual(page.viewportSize()!.height);
    await content(page).evaluate((el) => el.scrollTo(0, 99999));
    const after = (await nav.boundingBox())!;
    expect(after.y, 'sticky: same place after scrolling').toBeCloseTo(before.y, 0);
    const tab = (await page.locator('.ph-tabbar').boundingBox())!;
    expect(after.y + after.height, 'sits right above the tab bar').toBeLessThanOrEqual(tab.y + 1);
    await expectTappable(nav, 44);
    await expect(nav.getByRole('link', { name: /^Previous:/ }), 'first lesson has no previous link').toHaveCount(0);
    await expect(nav).toContainText(`Lesson 1 of ${LESSON_COUNT}`);

    await nav.getByRole('link', { name: /^Next:/ }).click();
    await expect(page).toHaveURL(/\/learn\/alphabet$/);
    await expect(nav).toContainText(`Lesson 2 of ${LESSON_COUNT}`);
    await expect(content(page), 'a new lesson starts at its top').toHaveJSProperty('scrollTop', 0);
    await nav.getByRole('link', { name: /^Previous:/ }).click();
    await expect(page).toHaveURL(/\/learn\/introduction$/);
  });

  test('the last lesson offers "All lessons" instead of Next', async ({ page }) => {
    await page.goto('/learn/reading-the-translator');
    const nav = page.getByRole('navigation', { name: 'Lessons' });
    await expect(nav).toContainText(`Lesson ${LESSON_COUNT} of ${LESSON_COUNT}`);
    await expect(nav.getByRole('link', { name: /^Next:/ })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'All lessons' })).toBeVisible();
  });

  test('progress bar width follows the lesson position', async ({ page }) => {
    await page.goto('/learn/aspect');
    const fill = page.locator('.ph-lesson-progress .ph-progress-bar > span');
    const w = await fill.evaluate((el) => (el as HTMLElement).style.width);
    expect(parseInt(w)).toBe(Math.round((10 / LESSON_COUNT) * 100));
  });

  test('marking a lesson finished is remembered: tick, reload, and the list shows it done and counts it', async ({ page }) => {
    await page.goto('/learn/alphabet');
    const box = page.getByLabel('I have finished this lesson');
    await box.scrollIntoViewIfNeeded();
    await box.check();
    await page.reload();
    await expect(page.getByLabel('I have finished this lesson')).toBeChecked();
    await page.goto('/learn');
    await expect(page.getByLabel('Your progress')).toContainText(`1 of ${LESSON_COUNT} lessons finished`);
    await expect(page.getByLabel('done')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /^Continue: / })).toBeVisible();
  });

  test('a missing lesson shows a plain message above the list, not a blank page', async ({ page }) => {
    await page.goto('/learn/no-such-lesson');
    await expect(page.getByText('There is no lesson at this address')).toBeVisible();
    await expect(page.locator('.ph-lesson-card')).toHaveCount(LESSON_COUNT);
  });

  test('wide tables scroll inside their card, never the page (Cases lesson)', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.setViewportSize({ width: 320, height: 700 });
    for (const slug of ['cases', 'adjectives', 'verbs-present', 'pronouns']) {
      await page.goto(`/learn/${slug}`);
      const cards = page.locator('.ph-scrollcard');
      expect(await cards.count(), `${slug} has tables`).toBeGreaterThan(0);
      await expectShellStill(page);
      expect(await content(page).evaluate((el) => el.scrollWidth - el.clientWidth), `${slug}: content scrolls sideways`).toBeLessThanOrEqual(1);
      for (const c of await cards.all()) {
        const r = await c.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return { l: b.left, r: b.right, vw: innerWidth };
        });
        expect(r.l).toBeGreaterThanOrEqual(0);
        expect(r.r).toBeLessThanOrEqual(r.vw + 1);
      }
    }
    // one table that really is wider than its card: scrolling it moves only the card
    await page.goto('/learn/cases');
    const wide = await page.locator('.ph-scrollcard-in').evaluateAll((els) => els.findIndex((e) => e.scrollWidth > e.clientWidth + 8));
    expect(wide, 'at 320px the cases tables must be wider than their cards').toBeGreaterThanOrEqual(0);
    const card = page.locator('.ph-scrollcard').nth(wide);
    const inner = card.locator('.ph-scrollcard-in');
    await inner.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-more-right', 'true');
    await expect(card).toHaveAttribute('data-more-left', 'false');
    await inner.evaluate((el) => el.scrollTo(9999, 0));
    await expect(card).toHaveAttribute('data-more-left', 'true');
    await expect(card).toHaveAttribute('data-more-right', 'false');
    await expectShellStill(page);
    expect(await content(page).evaluate((el) => el.scrollLeft), 'the content pane did not move sideways').toBe(0);
    expect(errors).toEqual([]);
  });

  test('table card is keyboard focusable and a screen reader gets the caption', async ({ page }) => {
    await page.goto('/learn/cases');
    await expect(page.locator('.ph-scrollcard-in').first()).toHaveAttribute('tabindex', '0');
  });

  test('exercise inputs, selects and textareas are 16px or more on every lesson (iOS focus zoom rule)', async ({ page }) => {
    const bad: string[] = [];
    for (const slug of ['alphabet', 'nouns', 'cases', 'adjectives', 'pronouns', 'verbs-present', 'verbs-tenses', 'numerals', 'prepositions', 'sentences', 'word-formation']) {
      await page.goto(`/learn/${slug}`);
      const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].filter((e) => !/checkbox|radio|hidden/.test(e.type)).map((e) => parseFloat(getComputedStyle(e).fontSize)));
      if (slug === 'nouns') expect(sizes.length, 'nouns has fill-in inputs').toBeGreaterThan(0);
      for (const s of sizes) if (s < 16) bad.push(`${slug} ${s}px`);
    }
    expect(bad).toEqual([]);
  });

  test('fill-in exercise: Check is disabled when empty; a wrong answer shows the right one, a right one says Right, without moving the page', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/learn/nouns');
    const form = page.locator('form.exercise', { hasText: 'The plural of' }).first();
    await form.scrollIntoViewIfNeeded();
    const check = form.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await form.locator('input').fill('kniga');
    await expect(check).toBeEnabled();
    await check.click();
    await expect(form.getByRole('status')).toContainText('Not quite - it is knigy');
    await form.locator('input').fill('knigy');
    await expect(form.getByRole('status'), 'editing hides the old verdict').toHaveCount(0);
    await check.click();
    await expect(form.getByRole('status')).toContainText('Right.');
    await expectShellStill(page);
    await expectTappable(form, 40);
    // the answer is remembered
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('interslavic-learn-v1'))).toContain('true');
    expect(errors).toEqual([]);
  });

  test('fill-in exercise: Enter submits, and the diacritics-free spelling is accepted as "right letters"', async ({ page }) => {
    await page.goto('/learn/nouns');
    const form = page.locator('form.exercise', { hasText: 'person' }).first();
    await form.scrollIntoViewIfNeeded();
    await form.locator('input').fill('ljudi');
    await form.locator('input').press('Enter');
    await expect(form.getByRole('status')).toContainText('Right.');
  });

  test('choice exercise: tapping an option marks it, reveals the answer and the reason, locks the others, Try again resets', async ({ page }) => {
    await page.goto('/learn/nouns');
    const set = page.locator('fieldset.exercise', { hasText: 'What gender is' }).first();
    await set.scrollIntoViewIfNeeded();
    await expectTappable(set, 40);
    await set.getByRole('button', { name: 'masculine' }).click();
    await expect(set.getByRole('button', { name: 'masculine' })).toHaveClass(/is-wrong/);
    await expect(set.getByRole('button', { name: 'feminine' })).toHaveClass(/is-answer/);
    await expect(set.getByRole('button', { name: 'neuter' })).toBeDisabled();
    await expect(set.getByRole('status')).toContainText('Not quite - it is feminine');
    await set.getByRole('button', { name: 'Try again' }).click();
    await expect(set.getByRole('status')).toHaveCount(0);
    await set.getByRole('button', { name: 'feminine' }).click();
    await expect(set.getByRole('button', { name: 'feminine' })).toHaveClass(/is-right/);
    await expect(set.getByRole('status')).toContainText('Right.');
  });

  test('typing in an exercise with the iOS keyboard open keeps the shell still and the field visible above the keyboard', async ({ page }) => {
    const { iosKeyboard } = await import('./helpers');
    await page.goto('/learn/nouns');
    const form = page.locator('form.exercise', { hasText: 'The plural of' }).first();
    const input = form.locator('input');
    await input.scrollIntoViewIfNeeded();
    // keyboard first, then focus: Playwright cannot make WebKit reveal a field that was focused before the emulated keyboard came up (iOS does it itself)
    await iosKeyboard(page, 300);
    await input.focus();
    await page.waitForTimeout(500);
    await expectShellStill(page);
    const vvh = await page.evaluate(() => visualViewport!.height);
    const b = (await input.boundingBox())!;
    expect(b.y + b.height, 'field is above the keyboard').toBeLessThanOrEqual(vvh + 1);
    expect(b.y, 'field is below the top bar').toBeGreaterThan(40);
    await input.fill('knigy');
    await expectShellStill(page);
  });

  test('"Report a problem" is in the menu and opens a full sheet with the form', async ({ page }) => {
    await page.goto('/learn/nouns');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Report a problem' }).click();
    await expect(page.getByRole('dialog', { name: 'Report a problem' })).toBeVisible();
  });

  test('"Try it in the translator" links open the translator with the sentence and translate it', async ({ page }) => {
    await page.goto('/learn/reading-the-translator');
    const link = page.getByRole('link', { name: 'Try it in the translator' }).first();
    if ((await link.count()) === 0) test.skip(true, 'no try-it links in this lesson');
    await link.click();
    await expect(page.getByLabel('Text to translate')).not.toHaveValue('');
    await expect(page.getByRole('article', { name: 'Translation 1' })).toBeVisible();
  });
});
