import { test, expect, type Page } from '@playwright/test';
import { expectNotCovered, expectTappable, mockApi, watchErrors } from './helpers';
import { layersWhen, openFixture, openTool, sheet, strip, tapAt, tool } from './photo-helpers';

/** Opens sign.png, waits until its text is found, and returns the screen boxes of its two lines (found by selecting all, then deselecting). */
async function signWithText(page: Page): Promise<{ lines: { x: number; y: number; w: number; h: number }[] }> {
  await openFixture(page, 'sign.png');
  await openTool(page, 'Text');
  await expect(sheet(page).locator('.pp-text')).toContainText('Text found', { timeout: 40_000 });
  await sheet(page).getByRole('button', { name: /Select all text/ }).click();
  await expect(page.locator('.live-band')).toHaveCount(2);
  const lines = await page.locator('.live-band').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  // deselect through the strip's More sheet is not needed: tapping the empty bottom of the picture clears it
  const c = await page.locator('.pp-wrap canvas').boundingBox();
  await tapAt(page, { x: c!.x + c!.width * 0.5, y: c!.y + c!.height * 0.95 });
  await expect(page.locator('.live-band')).toHaveCount(0);
  return { lines };
}

test.describe('Photo: Live Text on a phone', () => {
  test('tap a word selects it, a second tap the whole line; the floating bar offers Translate, Edit and Copy', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockApi(page);
    const { lines } = await signWithText(page);
    const l1 = lines[0]!;
    const word = { x: l1.x + 14, y: l1.y + l1.h / 2 };
    await tapAt(page, word);
    await expect(page.locator('.live-band')).toHaveCount(1);
    const wordBand = (await page.locator('.live-band').boundingBox())!;
    expect(wordBand.width, 'one word is narrower than the line').toBeLessThan(l1.w * 0.6);
    const bar = page.getByRole('toolbar', { name: 'Selected text' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: /Translate/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Edit/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Copy the text' })).toBeVisible();
    await expectTappable(bar);
    await expectNotCovered(bar.getByRole('button', { name: /Translate/ }));
    await expect(tool(page, 'Translate')).toBeVisible(); // the strip switched to the text tools
    // second tap on the same word: the whole line
    await tapAt(page, word);
    await expect.poll(async () => (await page.locator('.live-band').boundingBox())?.width ?? 0).toBeGreaterThan(l1.w * 0.85);
    // what Translate sends is the line, not the word
    await bar.getByRole('button', { name: /Translate/ }).click();
    await expect.poll(() => api.batch.length).toBeGreaterThan(0);
    const sent = (api.batch[0] as { lines: string[] }).lines.join(' ');
    expect(sent).toMatch(/GRAND\s+OPENING/i);
    expect(errors).toEqual([]);
  });

  test('a single tap sends only the word', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockApi(page);
    const { lines } = await signWithText(page);
    await tapAt(page, { x: lines[0]!.x + 14, y: lines[0]!.y + lines[0]!.h / 2 });
    await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: /Translate/ }).click();
    await expect.poll(() => api.batch.length).toBeGreaterThan(0);
    const sent = (api.batch[0] as { lines: string[] }).lines.join(' ');
    expect(sent).toMatch(/^\s*GRAND\s*$/i);
    expect(errors).toEqual([]);
  });

  test('Select all text picks every line; More lists Select all and Deselect; Edit starts typing', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await signWithText(page);
    await openTool(page, 'Text');
    await sheet(page).getByRole('button', { name: /Select all text/ }).click();
    await expect(page.locator('.live-band')).toHaveCount(2);
    await expect(page.getByRole('toolbar', { name: 'Selected text' })).toBeVisible();
    // More: Select all and Deselect exist; Deselect clears the picked text
    await openTool(page, 'More');
    const more = sheet(page).getByRole('list', { name: 'More' });
    await expect(more.getByRole('button', { name: 'Select all' })).toBeVisible();
    await expect(more.getByRole('button', { name: 'Translate to Interslavic' })).toBeVisible();
    await expect(more.getByRole('button', { name: 'Delete' }), 'found text is not a layer: nothing to delete').toHaveCount(0);
    await more.getByRole('button', { name: 'Deselect' }).click();
    await expect(page.locator('.live-band')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Selected text' })).toHaveCount(0);
    await expect(tool(page, 'Add')).toBeVisible(); // idle strip is back
    // Edit on the floating bar: a found line becomes a real text layer being typed
    await openTool(page, 'Text');
    await sheet(page).getByRole('button', { name: /Select all text/ }).click();
    await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: /Edit/ }).click();
    await expect(page.locator('.canvas-typing')).toBeVisible();
    await expect(page.locator('.canvas-typing')).toHaveValue(/GRAND\s+OPENING/i);
    expect(errors).toEqual([]);
  });

  test('"Translate all text" is offered only once the page has text layers', async ({ page }) => {
    await mockApi(page);
    await signWithText(page);
    await openTool(page, 'Text');
    await expect(sheet(page).getByRole('button', { name: /Translate all text/ })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: /Select all text/ }).click();
    await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Translate' }).click();
    await expect.poll(async () => (await layersWhen(page, () => true)).length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Deselect' }).count();
    const c = await page.locator('.pp-wrap canvas').boundingBox();
    await tapAt(page, { x: c!.x + c!.width * 0.5, y: c!.y + c!.height * 0.97 });
    await expect(strip(page).getByRole('button', { name: 'Layers' })).toBeVisible();
    await openTool(page, 'Text');
    await expect(sheet(page).getByRole('button', { name: /Translate all text/ })).toBeVisible();
  });
});
