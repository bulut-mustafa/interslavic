import { test, expect } from '@playwright/test';
import { expectShellStill, expectTappable, mockApi, watchErrors, fixture } from './helpers';
import { gotoPhoto, openFixture, openSample, openTool, sheet, strip, stage, tool, savedPages, canvasMap, tapAt } from './photo-helpers';

test.describe('Photo: opening a picture', () => {
  test('empty state is styled, has one title and a working picker', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await gotoPhoto(page);
    const empty = page.locator('.ph-photo-empty');
    await expect(empty.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // one title: the shell's top bar already says "Photo", the page must not say it a second time
    const same = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => e.children.length === 0 && e.offsetParent !== null && e.textContent?.trim() === 'Photo').length);
    expect(same, 'the word Photo is shown once as a title').toBe(1);
    await expect(empty.getByRole('heading', { level: 1 })).toHaveText('Edit a picture');
    // styled: the picker is a big filled/outlined button, not a bare browser file input
    const pick = page.locator('.ph-photo-pick');
    const box = (await pick.boundingBox())!;
    expect(box.height, 'picker is a big target').toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThan(200);
    const css = await pick.evaluate((e) => {
      const s = getComputedStyle(e);
      return { radius: parseFloat(s.borderTopLeftRadius), bg: s.backgroundColor, border: s.borderTopWidth };
    });
    expect(css.radius, 'rounded, not a default control').toBeGreaterThan(4);
    const heading = await empty.locator('h1').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(heading, 'title is larger than body text').toBeGreaterThan(20);
    // the real native file input is not shown as a visible raw control
    const input = page.getByLabel('Photo', { exact: true });
    const ib = await input.boundingBox();
    expect(!ib || ib.width * ib.height < 4 || (await input.evaluate((e) => getComputedStyle(e).opacity)) === '0' || (await input.evaluate((e) => getComputedStyle(e).position)) === 'absolute').toBe(true);
    await expectTappable(empty);
    await expectShellStill(page);
    // the picker works
    await input.setInputFiles(fixture('sign.png'));
    await expect(strip(page)).toBeVisible({ timeout: 20_000 });
    await expect(empty).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pages: 1 of 1' })).toHaveText('1 / 1');
    expect(errors).toEqual([]);
  });

  test('the sample picture opens with the tool strip and the canvas drawn', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openSample(page);
    await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    const m = await canvasMap(page);
    expect(m.w).toBeGreaterThan(100);
    // the canvas is not blank: some pixel differs from the first one
    const varied = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.pp-wrap canvas')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const first = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4 * 97) if (Math.abs(d[i]! - first[0]!) + Math.abs(d[i + 1]! - first[1]!) + Math.abs(d[i + 2]! - first[2]!) > 40) return true;
      return false;
    });
    expect(varied).toBe(true);
    await expect(tool(page, 'Add')).toBeVisible();
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('a 3000x4000 photo opens without a crash or a memory warning', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const consoleAll: string[] = [];
    page.on('console', (m) => consoleAll.push(`${m.type()}: ${m.text()}`));
    await mockApi(page);
    await openFixture(page, 'big-photo.jpg');
    await expect(page.locator('.pp-wrap canvas')).toBeVisible();
    // the picture is shrunk to something a phone can hold
    const m = await canvasMap(page);
    expect(Math.max(m.w, m.h), 'canvas is downscaled').toBeLessThanOrEqual(2600);
    expect(m.h / m.w).toBeCloseTo(4 / 3, 1);
    await page.waitForTimeout(1500);
    const messages = await page.locator('.pp-toast, .pp-note.is-error, [role="alert"]').allInnerTexts();
    expect(messages.join(' | '), 'no memory / size warning shown').not.toMatch(/memory|too (big|large)|out of|crash|could not/i);
    expect(consoleAll.filter((l) => /memory|out of|crash/i.test(l))).toEqual([]);
    await expect(tool(page, 'Add')).toBeEnabled();
    // still responsive: a sheet opens
    await openTool(page, 'Adjust');
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('a picture with no text says "No text found" and offers no translation of garbage', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockApi(page);
    await openFixture(page, 'noise.png');
    await openTool(page, 'Text');
    const body = sheet(page).locator('.pp-text');
    await expect(body).toContainText('No text found', { timeout: 40_000 });
    await expect(body).not.toContainText('Text found.');
    await expect(sheet(page).getByRole('button', { name: /Select all text/ })).toBeDisabled();
    await expect(sheet(page).getByRole('button', { name: /Translate all text/ })).toHaveCount(0);
    // no found words to tap: nothing to select, no floating Translate
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.live-band')).toHaveCount(0);
    const m = await canvasMap(page);
    await tapAt(page, { x: m.left + (m.w * m.k) / 2, y: m.top + (m.h * m.k) / 2 });
    await expect(page.locator('.ph-fbar')).toHaveCount(0);
    await expect(tool(page, 'Translate')).toHaveCount(0);
    expect(api.batch).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a picture with text reports text found, with a band over each line', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Text');
    await expect(sheet(page).locator('.pp-text')).toContainText('Text found', { timeout: 40_000 });
    await expect(sheet(page).locator('.pp-text')).not.toContainText('No text found');
    await expect(sheet(page).getByRole('button', { name: /Select all text/ })).toBeEnabled();
    // Select all: a band over each of the two lines of the sign
    await sheet(page).getByRole('button', { name: /Select all text/ }).click();
    await expect(page.locator('.live-band')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('the first picture is saved (page record exists after a moment)', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await expect.poll(async () => (await savedPages(page)).length, { timeout: 8000 }).toBe(1);
    expect(stage).toBeDefined();
  });
});
