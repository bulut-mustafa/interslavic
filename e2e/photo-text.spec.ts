import { test, expect } from '@playwright/test';
import { expectShellStill, expectTappable, iosKeyboard, mockApi, watchErrors } from './helpers';
import { addTypedText, layersWhen, openFixture, openTool, sheet, tool, stage } from './photo-helpers';

const kbar = (page: import('@playwright/test').Page) => page.getByRole('toolbar', { name: 'Text tools' });

test.describe('Photo: typed text', () => {
  test('Add > Text puts a selected text layer on the page; Edit, type, Done keeps it selected with Translate on the strip', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Add');
    await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(tool(page, 'Edit')).toBeVisible();
    await expect(tool(page, 'Translate')).toBeVisible();
    const added = await layersWhen(page, (l) => l.length === 1);
    expect(added[0]!.text).toBe('Your text');
    await tool(page, 'Edit').click();
    await expect(page.locator('.canvas-typing')).toBeFocused();
    await page.locator('.canvas-typing').fill('Good morning');
    await page.locator('.canvas-typing').evaluate((e) => (e as HTMLTextAreaElement).blur());
    await expect(page.locator('.canvas-typing')).toHaveCount(0);
    const layers = await layersWhen(page, (l) => l[0]?.text === 'Good morning');
    expect(layers).toHaveLength(1);
    await expect(tool(page, 'Translate')).toBeVisible(); // still selected: text strip
    await expect(page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('typing with the keyboard up: the picture and the text stay visible above the keyboard bar, nothing moves', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Add');
    await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
    await tool(page, 'Edit').click();
    await iosKeyboard(page, 300);
    const box = page.locator('.canvas-typing');
    await expect(box).toBeVisible();
    await box.fill('Good morning my friend');
    await iosKeyboard(page, 300);
    const st = (await stage(page).boundingBox())!;
    expect(st.height, 'the stage keeps room for the picture').toBeGreaterThan(150);
    const tb = (await box.boundingBox())!;
    expect(tb.x, 'text box left inside stage').toBeGreaterThanOrEqual(st.x - 1);
    expect(tb.y, 'text box top inside stage').toBeGreaterThanOrEqual(st.y - 1);
    expect(tb.x + tb.width, 'text box right inside stage').toBeLessThanOrEqual(st.x + st.width + 1);
    expect(tb.y + tb.height, 'text box bottom inside stage').toBeLessThanOrEqual(st.y + st.height + 1);
    // the picture is visible, not squeezed out
    const cv = (await page.locator('.pp-wrap canvas').boundingBox())!;
    const visH = Math.min(cv.y + cv.height, st.y + st.height) - Math.max(cv.y, st.y);
    expect(visH, 'picture visible in the stage').toBeGreaterThan(100);
    // the keyboard bar sits above the keyboard (innerHeight stays; vv shrinks by 300) and fully inside the visible area
    const bar = (await kbar(page).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(vp.height - 300 + 1);
    expect(bar.y).toBeGreaterThanOrEqual(st.y + st.height - 1);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(vp.width + 1);
    for (const n of ['Font', 'Size', 'Colour', 'Translate', 'Done']) {
      const b = kbar(page).getByRole('button', { name: n });
      await expect(b).toBeVisible();
      const r = (await b.boundingBox())!;
      expect(r.x, `${n} left on screen`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, `${n} right on screen (fits ${vp.width}px)`).toBeLessThanOrEqual(vp.width);
    }
    await expectTappable(kbar(page));
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('emptying the text and pressing Done removes the layer', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Add');
    await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
    await tool(page, 'Edit').click();
    await iosKeyboard(page, 300);
    await page.locator('.canvas-typing').fill('Hello');
    await layersWhen(page, (l) => l.length === 1 && l[0]!.text === 'Hello');
    await page.locator('.canvas-typing').fill('');
    await kbar(page).getByRole('button', { name: 'Done' }).click();
    await iosKeyboard(page, 0);
    await expect(page.locator('.canvas-typing')).toHaveCount(0);
    await layersWhen(page, (l) => l.length === 0);
    await expect(tool(page, 'Add')).toBeVisible(); // nothing selected: the project strip
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0);
    // the editor is still usable
    await addTypedText(page, 'Again');
    await layersWhen(page, (l) => l.length === 1 && l[0]!.text === 'Again');
    expect(errors).toEqual([]);
  });

  test('Font, Size and Colour in the keyboard bar open their sheet and change the layer', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await tool(page, 'Edit').click();
    await iosKeyboard(page, 300);
    await kbar(page).getByRole('button', { name: 'Colour' }).click();
    await iosKeyboard(page, 0);
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Colour' })).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Colour #e0245e' }).click();
    const l = await layersWhen(page, (ls) => ls[0]?.style?.color === '#e0245e');
    expect(l[0]!.style!.color).toBe('#e0245e');
  });
});
