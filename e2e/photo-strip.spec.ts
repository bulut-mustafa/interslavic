import { test, expect } from '@playwright/test';
import { drag, expectNotCovered, expectShellStill, mockApi, watchErrors } from './helpers';
import { addTypedText, openFixture, openTool, sheet, strip, swipeX, tapEmpty, tool } from './photo-helpers';

const labels = (page: import('@playwright/test').Page) => strip(page).getByRole('button').allInnerTexts().then((a) => a.map((t) => t.trim()));
const scrollLeft = (page: import('@playwright/test').Page) => strip(page).evaluate((e) => e.scrollLeft);

test.describe('Photo: the bottom tool strip', () => {
  for (const width of [390, 360, 320]) {
    test(`at ${width}px the text strip scrolls sideways with a swipe and its last tool becomes reachable`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await mockApi(page);
      await openFixture(page, 'sign.png');
      await addTypedText(page, 'Hello');
      await page.setViewportSize({ width, height: 700 });
      await expect(tool(page, 'Edit')).toBeVisible();
      const m = await strip(page).evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, sl: e.scrollLeft }));
      expect(m.cw, 'the strip is as wide as the screen, not as wide as its tools').toBeLessThanOrEqual(width);
      expect(m.sw, 'nine tools do not fit: it scrolls').toBeGreaterThan(m.cw + 20);
      expect(await labels(page)).toEqual(['Edit', 'Translate', 'Font', 'Size', 'Colour', 'Effects', 'Position', 'Layers', 'More']);
      // before the swipe the last tool is off screen
      const more = tool(page, 'More');
      const r0 = (await more.boundingBox())!;
      expect(r0.x + r0.width, 'More is past the right edge at first').toBeGreaterThan(width);
      await expect(strip(page).locator('xpath=..')).toHaveClass(/fade-right/);
      await swipeX(page, strip(page), -300);
      await swipeX(page, strip(page), -300);
      expect(await scrollLeft(page), 'scrollLeft changed').toBeGreaterThan(m.sl + 20);
      const r1 = (await more.boundingBox())!;
      expect(r1.x, 'More now on screen').toBeGreaterThanOrEqual(0);
      expect(r1.x + r1.width, 'More fully on screen').toBeLessThanOrEqual(width + 0.5);
      await expectNotCovered(more);
      await expect(strip(page).locator('xpath=..')).toHaveClass(/fade-left/);
      await expect(strip(page).locator('xpath=..')).not.toHaveClass(/fade-right/);
      await more.click();
      await expect(sheet(page)).toHaveAttribute('aria-label', 'More');
      await expectShellStill(page);
      expect(errors).toEqual([]);
    });
  }

  test('the strip changes with the selection: project tools, text tools, picture tools, back', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    expect(await labels(page)).toEqual(['Add', 'Background', 'Crop', 'Adjust', 'Text', 'Layers']);
    await addTypedText(page, 'Hello');
    expect(await labels(page)).toEqual(['Edit', 'Translate', 'Font', 'Size', 'Colour', 'Effects', 'Position', 'Layers', 'More']);
    await tapEmpty(page);
    expect(await labels(page)).toEqual(['Add', 'Background', 'Crop', 'Adjust', 'Text', 'Layers']);
    await openTool(page, 'Add');
    await page.getByLabel('Add pictures').setInputFiles('e2e/fixtures/noise.png');
    await expect(tool(page, 'Frame')).toBeVisible();
    expect(await labels(page)).toEqual(['Adjust', 'Effects', 'Frame', 'Position', 'Layers', 'More']);
    // a shape has its own strip
    await openTool(page, 'Add');
    await sheet(page).getByRole('button', { name: 'Add rectangle' }).click();
    await expect(tool(page, 'Colour')).toBeVisible();
    expect(await labels(page)).toEqual(['Colour', 'Effects', 'Position', 'Layers', 'More']);
  });

  test('each tool opens its own sheet, one at a time, and Done, Escape and a drag down close it and bring the strip back', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    const expected: [string, string][] = [['Translate', 'Translate to Interslavic'], ['Font', 'Font'], ['Size', 'Size'], ['Colour', 'Colour'], ['Effects', 'Effects'], ['Position', 'Position'], ['Layers', 'Layers'], ['More', 'More']];
    for (const [name, title] of expected) {
      await tool(page, name).click();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', title);
      await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(title);
      await expect(strip(page), 'the strip makes way for the sheet').toHaveCount(0);
      await expect(page.locator('.pp-pages'), 'the page row makes way too').toHaveCount(0);
      // close with Done
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(strip(page)).toBeVisible();
      await expect(tool(page, 'Edit')).toBeVisible();
    }
    // Escape
    await tool(page, 'Font').click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(strip(page)).toBeVisible();
    // the grabber: a tap cycles the height, a drag down closes
    await tool(page, 'Layers').click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toHaveAttribute('data-detent', '0');
    const grab = dlg.getByRole('button', { name: 'Resize sheet' });
    await grab.click();
    await expect(dlg).toHaveAttribute('data-detent', '1');
    const gb = (await grab.boundingBox())!;
    await drag(page, { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, { x: gb.x + gb.width / 2, y: gb.y + 600 }, 20);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(strip(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('choosing another tool from an open sheet is not possible by accident: one sheet exists at a time through the whole flow', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await tool(page, 'Colour').click();
    await expect(page.locator('.ph-sheet')).toHaveCount(1);
    await page.getByRole('button', { name: 'Done' }).click();
    await tool(page, 'Size').click();
    await expect(page.locator('.ph-sheet')).toHaveCount(1);
    await expect(page.locator('.ph-sheet-title')).toHaveText('Size');
  });

  test('selecting a different thing while a tool sheet is open closes sheets that do not belong to it', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await tool(page, 'Font').click();
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Font');
    // the sheet covers the lower half; tap empty canvas above it (the picture top)
    const c = await page.locator('.pp-wrap canvas').boundingBox();
    await page.touchscreen.tap(c!.x + 8, c!.y + 8);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tool(page, 'Add')).toBeVisible();
  });
});
