import { test, expect, type Page } from '@playwright/test';
import { drag, expectNotCovered, expectShellStill, mockApi, pinch, watchErrors, fixture } from './helpers';
import { addTypedText, canvasMap, layersWhen, openFixture, openTool, tapAt, tapEmpty, tool, toScreen, type SavedLayer } from './photo-helpers';

/** The screen point at the middle of a typed text layer (centred in its wrap width, one line tall). */
async function textCentre(page: Page, l: SavedLayer): Promise<{ x: number; y: number }> {
  const size = l.style!.size;
  return toScreen(page, l.x + (l as unknown as { maxWidth: number }).maxWidth / 2, l.y + (size * 1.25) / 2);
}

async function oneText(page: Page, text = 'Hello'): Promise<SavedLayer> {
  await openFixture(page, 'sign.png');
  await addTypedText(page, text);
  const [l] = await layersWhen(page, (ls) => ls.length === 1 && ls[0]!.text === text);
  return l!;
}

test.describe('Photo: gestures', () => {
  test('dragging a selected text moves it, undo puts it back', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    const l0 = await oneText(page);
    const k = (await canvasMap(page)).k;
    const c = await textCentre(page, l0);
    await drag(page, c, { x: c.x + 60, y: c.y + 40 });
    const [l1] = await layersWhen(page, (ls) => Math.abs(ls[0]!.x - l0.x) > 10);
    expect(l1!.x - l0.x, 'moved right by about the finger travel').toBeGreaterThan(60 / k - 20);
    expect(l1!.x - l0.x).toBeLessThan(60 / k + 20);
    expect(l1!.y - l0.y).toBeGreaterThan(40 / k - 20);
    expect(l1!.y - l0.y).toBeLessThan(40 / k + 20);
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible(); // still selected, bar back after the drag
    await page.getByRole('button', { name: 'Undo' }).click();
    const [l2] = await layersWhen(page, (ls) => Math.abs(ls[0]!.x - l0.x) < 1);
    expect(l2!.y).toBeCloseTo(l0.y, 0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await layersWhen(page, (ls) => Math.abs(ls[0]!.x - l0.x) > 10);
    expect(errors).toEqual([]);
  });

  test('a drag cannot push the text off the page', async ({ page }) => {
    await mockApi(page);
    const l0 = await oneText(page);
    const m = await canvasMap(page);
    const c = await textCentre(page, l0);
    await drag(page, c, { x: c.x + 2000, y: c.y }, 16);
    const [l] = await layersWhen(page, (ls) => ls[0]!.x > l0.x + 50);
    // some of the text stays on the page
    expect(l!.x, 'part of the layer still on the page').toBeLessThan(m.w);
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible();
  });

  test('a two-finger pinch on the text changes its size, within limits', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    const l0 = await oneText(page);
    const c = await textCentre(page, l0);
    await pinch(page, c, 30, 75);
    const [big] = await layersWhen(page, (ls) => ls[0]!.style!.size > l0.style!.size * 1.5);
    expect(big!.style!.size).toBeLessThan(l0.style!.size * 3.2);
    // extreme spread is capped at half the page height
    const m = await canvasMap(page);
    const c2 = await textCentre(page, big!);
    await pinch(page, c2, 20, 190);
    const [huge] = await layersWhen(page, (ls) => ls[0]!.style!.size >= big!.style!.size);
    expect(huge!.style!.size).toBeLessThanOrEqual(Math.max(60, Math.round(m.h / 2)));
    // pinching in cannot go below the floor
    const c3 = await textCentre(page, huge!);
    await pinch(page, c3, 190, 2);
    const [small] = await layersWhen(page, (ls) => ls[0]!.style!.size < huge!.style!.size);
    expect(small!.style!.size).toBeGreaterThanOrEqual(8);
    // the text's centre stays on the page
    const cx = small!.x + (small as unknown as { maxWidth: number }).maxWidth / 2;
    expect(cx).toBeGreaterThan(0);
    expect(cx).toBeLessThan(m.w);
    expect(errors).toEqual([]);
  });

  test('a tap on the empty picture deselects; a tap on the text selects it again', async ({ page }) => {
    await mockApi(page);
    const l0 = await oneText(page);
    await expect(tool(page, 'Edit')).toBeVisible();
    await tapEmpty(page);
    await expect(tool(page, 'Add')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0);
    await tapAt(page, await textCentre(page, l0));
    await expect(tool(page, 'Edit')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible();
  });

  test('pinching empty canvas zooms the picture; a drag on empty canvas then pans it; pinching back resets', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    const m0 = await canvasMap(page);
    const c0 = { x: m0.left + (m0.w * m0.k) / 2, y: m0.top + (m0.h * m0.k) * 0.9 };
    await pinch(page, c0, 30, 110);
    const m1 = await canvasMap(page);
    expect(m1.k, 'zoomed in').toBeGreaterThan(m0.k * 1.8);
    await expectShellStill(page);
    // drag an empty spot: the picture pans
    const before = await canvasMap(page);
    await drag(page, { x: 195, y: 150 }, { x: 125, y: 120 });
    const after = await canvasMap(page);
    expect(Math.abs(after.left - before.left) + Math.abs(after.top - before.top), 'panned').toBeGreaterThan(20);
    expect(after.k).toBeCloseTo(before.k, 5);
    await expectShellStill(page);
    // zoom out below 1: back to the fitted picture
    const s = (await page.locator('.pp-stage').boundingBox())!;
    await pinch(page, { x: s.x + s.width / 2, y: s.y + s.height / 2 }, 120, 20);
    await expect.poll(async () => (await canvasMap(page)).k).toBeCloseTo(m0.k, 2);
    expect(errors).toEqual([]);
  });

  test('without zoom, dragging empty canvas does not move the picture', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    const m0 = await canvasMap(page);
    await drag(page, { x: m0.left + 20, y: m0.top + 20 }, { x: m0.left + 100, y: m0.top + 80 });
    const m1 = await canvasMap(page);
    expect(m1.left).toBeCloseTo(m0.left, 1);
    expect(m1.top).toBeCloseTo(m0.top, 1);
  });

  test('a picture layer: drag moves it, the handles are 44px and not covered, a corner drag resizes', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Add');
    await page.getByLabel('Add pictures').setInputFiles(fixture('noise.png'));
    await expect(page.locator('[data-testid="transform-box"]')).toBeVisible();
    const [img0] = await layersWhen(page, (ls) => ls.length === 1 && !!ls[0]!.src);
    const handles = page.locator('.tbox-h');
    const n = await handles.count();
    expect(n, 'corner and edge handles plus rotate').toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const h = handles.nth(i);
      const b = (await h.boundingBox())!;
      expect(b.width, `handle ${i} hit width`).toBeGreaterThanOrEqual(44);
      expect(b.height, `handle ${i} hit height`).toBeGreaterThanOrEqual(44);
      // the visible mark is reachable: the centre of the handle is not under the floating bar or another control
      await expectNotCovered(h);
    }
    // move the picture by dragging its middle (it is selected: the body takes the touch)
    const c = await toScreen(page, img0!.x + img0!.w! / 2, img0!.y + img0!.h! / 2);
    await drag(page, c, { x: c.x + 30, y: c.y + 20 });
    const [img1] = await layersWhen(page, (ls) => Math.abs(ls[0]!.x - img0!.x) > 10 || Math.abs(ls[0]!.y - img0!.y) > 10);
    expect(img1!.x - img0!.x).toBeGreaterThan(5);
    // resize by the bottom-right corner
    const br = page.locator('.tbox-h[data-handle="se"], .tbox-h[data-handle="br"]').first();
    const bb = (await br.boundingBox())!;
    const from = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    await drag(page, from, { x: from.x - 40, y: from.y - 30 });
    const [img2] = await layersWhen(page, (ls) => Math.abs(ls[0]!.w! - img1!.w!) > 5);
    expect(img2!.w!).toBeLessThan(img1!.w!);
    expect(errors).toEqual([]);
  });

  test('performance: 40 drag moves leave no long tasks over a loose bound and no errors', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    const l0 = await oneText(page, 'Hello there');
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    });
    const c = await textCentre(page, l0);
    await drag(page, c, { x: c.x + 80, y: c.y + 60 }, 40);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    // Safari has no 'longtask' entries (nothing is recorded): then this checks only that the drag finished; elsewhere it bounds the stalls.
    expect(Math.max(0, ...long), `long tasks ${JSON.stringify(long)}`).toBeLessThan(400);
    expect(long.length, 'few long tasks').toBeLessThan(6);
    await layersWhen(page, (ls) => Math.abs(ls[0]!.x - l0.x) > 20);
    // the editor still answers
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(errors).toEqual([]);
  });
});
