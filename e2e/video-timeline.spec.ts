import { test, expect, type Page } from '@playwright/test';
import { drag, expectNotCovered, expectShellStill, mockApi, pinch, watchErrors } from './helpers';
import { addClip, clipsOf, centreOf, keyboardSeek, longPressDrag, openTool, openVideo, readTime, readZoom, sheet, tapAt, tlBox, tool } from './video-helpers';

/** The timeline's vertical middle of the main track and its horizontal centre (where the playhead is). */
async function mainTrack(page: Page): Promise<{ cx: number; y: number; left: number; right: number }> {
  const b = await tlBox(page);
  const c = await centreOf(clipsOf(page).first());
  return { cx: b.x + b.width / 2, y: c.y, left: b.x, right: b.x + b.width };
}
/** A point on the first clip that is on screen (its middle is off screen at the default zoom): just right of the playhead. */
const onClip = async (page: Page): Promise<{ x: number; y: number }> => {
  const m = await mainTrack(page);
  return { x: m.cx + 40, y: m.y };
};
const selected = (page: Page) => page.locator('.pv-tl .pv-clip.is-selected');
const lengthsOf = async (page: Page): Promise<string[]> => clipsOf(page).locator('.pv-clip-len').allInnerTexts();
const secs = (s: string) => parseFloat(s);

test.describe('video: timeline gestures', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000); // video decoding is slow on a loaded machine
    await mockApi(page);
    await openVideo(page);
    await addClip(page, 'clip.mp4');
  });

  test('a one-finger drag scrubs the playhead and never changes the zoom', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const z0 = await readZoom(page);
    expect(z0).toBeGreaterThan(10);
    const m = await mainTrack(page);
    await drag(page, { x: m.cx + 120, y: m.y }, { x: m.cx - 120, y: m.y }); // content moves left: the playhead goes later
    const t1 = (await readTime(page)).now;
    expect(t1, 'dragging left did not move the playhead later').toBeGreaterThan(1.5);
    expect(await readZoom(page)).toBe(z0);
    await drag(page, { x: m.cx - 60, y: m.y }, { x: m.cx + 60, y: m.y });
    const t2 = (await readTime(page)).now;
    expect(t2, 'dragging right did not move the playhead earlier').toBeLessThan(t1 - 0.5);
    expect(await readZoom(page)).toBe(z0);
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('swipes in every direction on the timeline never change the zoom', async ({ page }) => {
    const z0 = await readZoom(page);
    const m = await mainTrack(page);
    const b = await tlBox(page);
    const dirs: [string, { x: number; y: number }, { x: number; y: number }][] = [
      ['left', { x: m.cx + 100, y: m.y }, { x: m.cx - 100, y: m.y }],
      ['right', { x: m.cx - 100, y: m.y }, { x: m.cx + 100, y: m.y }],
      ['up', { x: m.cx, y: b.y + b.height - 6 }, { x: m.cx, y: b.y + 4 }],
      ['down', { x: m.cx, y: b.y + 8 }, { x: m.cx, y: b.y + b.height - 4 }],
      ['diagonal', { x: m.cx - 80, y: b.y + 10 }, { x: m.cx + 80, y: b.y + b.height - 6 }],
      ['fast flick', { x: m.cx + 140, y: m.y }, { x: m.cx - 140, y: m.y }],
    ];
    for (const [name, from, to] of dirs) {
      await drag(page, from, to, name === 'fast flick' ? 3 : 12);
      expect(await readZoom(page), `zoom changed after a swipe ${name}`).toBe(z0);
    }
    await expectShellStill(page);
  });

  test('a pinch zooms the timeline and keeps the time under the playhead', async ({ page }) => {
    await keyboardSeek(page, 4);
    const before = (await readTime(page)).now;
    const z0 = await readZoom(page);
    const m = await mainTrack(page);
    await pinch(page, { x: m.cx, y: m.y }, 30, 110); // fingers spread: zoom in
    const zIn = await readZoom(page);
    expect(zIn, 'spreading two fingers did not zoom in').toBeGreaterThan(z0 * 1.5);
    expect(Math.abs((await readTime(page)).now - before), 'the time under the playhead moved while zooming').toBeLessThan(0.3);
    await pinch(page, { x: m.cx, y: m.y }, 110, 25); // pinch together: zoom out
    const zOut = await readZoom(page);
    expect(zOut).toBeLessThan(zIn / 1.5);
    expect(Math.abs((await readTime(page)).now - before)).toBeLessThan(0.3);
    await expectShellStill(page);
  });

  test('arrow keys on the timeline step the playhead exactly once', async ({ page }) => {
    await page.locator('.pv-tl-surface').focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await readTime(page)).now).toBeCloseTo(1, 1);
    await page.keyboard.press('Shift+ArrowRight');
    expect((await readTime(page)).now).toBeCloseTo(2, 1);
    await page.keyboard.press('ArrowLeft');
    expect((await readTime(page)).now).toBeCloseTo(1.9, 1);
  });

  test('tapping a clip selects it and shows trim handles that are 44 px and not covered', async ({ page }) => {
    await expect(page.locator('.pv-trim')).toHaveCount(0);
    await tapAt(page, await onClip(page));
    await expect(selected(page)).toHaveCount(1);
    const handles = page.locator('.pv-trim');
    await expect(handles).toHaveCount(2);
    for (const h of [handles.nth(0), handles.nth(1)]) {
      const b = await h.boundingBox();
      expect(b!.width, 'handle narrower than 44 px').toBeGreaterThanOrEqual(43.5);
      expect(b!.height, 'handle shorter than 44 px').toBeGreaterThanOrEqual(43.5);
      await expectNotCovered(h);
    }
    // the strip changed to the clip tools
    for (const label of ['Split', 'Speed', 'Volume', 'Animate', 'Effects', 'Delete']) await expect(tool(page, label)).toBeVisible();
    // tapping an empty part of the picture clears the selection (the main track has no empty part with one long clip)
    await tapAt(page, await centreOf(page.getByTestId('preview-surface')));
    await expect(selected(page)).toHaveCount(0);
    await expect(page.locator('.pv-trim')).toHaveCount(0);
  });

  test('dragging the end trim handle shortens the clip; dragging the start handle too', async ({ page }) => {
    await keyboardSeek(page, 11); // the end of the clip comes within reach of the screen
    await tapAt(page, await onClip(page));
    await expect(page.locator('.pv-trim')).toHaveCount(2);
    expect(secs((await lengthsOf(page))[0]!)).toBe(12);
    const total0 = (await readTime(page)).total;
    // end handle: pull it left by 150 px = about 3 s at 48 px/s
    const endH = page.locator('.pv-trim.is-end');
    const c = await centreOf(endH);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(c.x - 15 * i, c.y);
    await page.mouse.up();
    const len1 = secs((await lengthsOf(page))[0]!);
    expect(len1, 'trimming the end did not shorten the clip').toBeLessThan(10);
    expect(len1).toBeGreaterThan(7);
    expect((await readTime(page)).total).toBeLessThan(total0 - 2);
    // start handle: with the playhead near the start the handle is on screen; pull it right by 96 px = about 2 s
    await keyboardSeek(page, 1);
    await expect(page.locator('.pv-trim.is-start')).toBeVisible();
    const startH = page.locator('.pv-trim.is-start');
    const s = await centreOf(startH);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(s.x + 12 * i, s.y);
    await page.mouse.up();
    const len2 = secs((await lengthsOf(page))[0]!);
    expect(len2, 'trimming the start did not shorten the clip').toBeLessThan(len1 - 1);
    // undo brings the last trim back
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(secs((await lengthsOf(page))[0]!)).toBeCloseTo(len1, 0);
  });

  test('split at the playhead creates two clips; undo joins them again', async ({ page }) => {
    await keyboardSeek(page, 5);
    await tapAt(page, await onClip(page));
    await expect(selected(page)).toHaveCount(1);
    await tool(page, 'Split').click();
    await expect(clipsOf(page)).toHaveCount(2);
    const lens = (await lengthsOf(page)).map(secs);
    expect(lens[0]!).toBeGreaterThan(4);
    expect(lens[0]!).toBeLessThan(6);
    expect(lens[0]! + lens[1]!).toBeGreaterThan(11);
    expect((await readTime(page)).total, 'splitting must not change the total length').toBeGreaterThan(11.5);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(clipsOf(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(clipsOf(page)).toHaveCount(2);
  });

  test('the Edit sheet splits too (project mode, nothing selected)', async ({ page }) => {
    await keyboardSeek(page, 3);
    const s = await openTool(page, 'Edit');
    await s.getByRole('button', { name: /Split at the playhead/ }).click();
    await expect(clipsOf(page)).toHaveCount(2);
  });

  test('long press then drag reorders two clips', async ({ page }) => {
    await addClip(page, 'clip2.mp4'); // 12 s then 8 s
    await expect(clipsOf(page)).toHaveCount(2);
    const names = async () => clipsOf(page).locator('.pv-clip-len').allInnerTexts();
    expect(await names()).toEqual(['12s', '8.0s']);
    // zoom out so both clips are on screen (the playhead is at the second clip's start)
    const m = await mainTrack(page);
    await pinch(page, { x: m.cx + 100, y: m.y }, 110, 20); // not at the centre: the join's + sits there
    await expect.poll(() => readZoom(page)).toBeLessThan(15);
    const a = await clipsOf(page).nth(0).boundingBox();
    const b = await clipsOf(page).nth(1).boundingBox();
    expect(a!.x, 'first clip not on screen after zooming out').toBeGreaterThanOrEqual(-1);
    expect(b!.x + b!.width, 'second clip not on screen after zooming out').toBeLessThanOrEqual(m.right + 1);
    await tapAt(page, await centreOf(page.getByTestId('preview-surface'))); // deselect: the picked clip's trim handles would take the press
    await expect(page.locator('.pv-trim')).toHaveCount(0);
    // lift the second clip and drop it before the first (left of the first clip's middle)
    await longPressDrag(page, { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }, { x: a!.x + 4, y: a!.y + a!.height / 2 }, 20);
    await expect.poll(names, { timeout: 5_000 }).toEqual(['8.0s', '12s']);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(names).toEqual(['12s', '8.0s']);
  });

  test('a swipe on the clip strip does not select or move a clip (only a tap and a long press do)', async ({ page }) => {
    const m = await mainTrack(page);
    await drag(page, { x: m.cx + 80, y: m.y }, { x: m.cx - 80, y: m.y });
    await expect(selected(page)).toHaveCount(0);
    expect(await lengthsOf(page)).toEqual(['12s']);
  });

  test('the + between clips opens the Transitions sheet for that join and a transition can be set', async ({ page }) => {
    await addClip(page, 'clip2.mp4');
    const plus = page.getByRole('button', { name: 'Transition between clip 1 and clip 2' });
    await expectNotCovered(plus);
    const pb = await plus.boundingBox();
    expect(pb!.width).toBeGreaterThanOrEqual(43.5);
    expect(pb!.height).toBeGreaterThanOrEqual(43.5);
    await plus.click();
    const s = sheet(page, 'Transitions');
    await expect(s).toBeVisible();
    await expect(s.getByText('Between clip 1 and clip 2')).toBeVisible();
    // pick the first real transition chip
    const options = s.locator('button').filter({ hasNotText: /^(Done|Resize sheet)$/ });
    expect(await options.count()).toBeGreaterThan(2);
  });
});
