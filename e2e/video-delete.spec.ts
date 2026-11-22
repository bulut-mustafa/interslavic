import { test, expect, type Page } from '@playwright/test';
import { mockApi, watchErrors, expectShellStill } from './helpers';
import { addClip, canvasInfo, centreOf, clipsOf, keyboardSeek, openVideo, readTime, tapAt, tlBox, tool } from './video-helpers';

const empty = (page: Page) => page.getByRole('heading', { name: 'Add a video to start' });
const lens = (page: Page) => clipsOf(page).locator('.pv-clip-len').allInnerTexts();

/** A point on the first clip that is on screen: just right of the playhead (the playhead is at 0). */
async function selectFirst(page: Page): Promise<void> {
  const b = await tlBox(page);
  const c = await centreOf(clipsOf(page).first());
  await tapAt(page, { x: b.x + b.width / 2 + 30, y: c.y });
  await expect(page.locator('.pv-clip.is-selected')).toHaveCount(1);
}

test.describe('video: delete', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000); // video decoding is slow on a loaded machine
    await mockApi(page);
  });

  test('deleting one of three clips ripples the rest and keeps the playhead inside the edit; undo and redo', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await openVideo(page);
    await addClip(page, 'clip2.mp4'); // 8
    await addClip(page, 'clip.mp4'); // 12
    await addClip(page, 'clip2.mp4'); // 8
    expect(await lens(page)).toEqual(['8.0s', '12s', '8.0s']);
    expect((await readTime(page)).total).toBeGreaterThan(27);
    // the new clip is selected after adding: select the first clip with the playhead at its start
    await keyboardSeek(page, 0);
    await selectFirst(page);
    await tool(page, 'Delete').click();
    await expect(clipsOf(page)).toHaveCount(2);
    expect(await lens(page)).toEqual(['12s', '8.0s']);
    const t = await readTime(page);
    expect(t.total).toBeGreaterThan(19.3);
    expect(t.total).toBeLessThan(20.8);
    expect(t.now).toBeGreaterThanOrEqual(0);
    expect(t.now).toBeLessThanOrEqual(t.total);
    await expect(page.locator('.pv-trim')).toHaveCount(0); // nothing selected any more
    await expect(tool(page, 'Edit')).toBeVisible(); // the strip is back to the project tools
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(clipsOf(page)).toHaveCount(3);
    expect(await lens(page)).toEqual(['8.0s', '12s', '8.0s']);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(clipsOf(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('deleting the last clip while the playhead is at the end leaves the playhead inside the shorter edit', async ({ page }) => {
    await openVideo(page);
    await addClip(page, 'clip.mp4');
    await addClip(page, 'clip2.mp4'); // the playhead sits at 12 s, the start of the new, selected, clip
    await keyboardSeek(page, 19);
    expect((await readTime(page)).now).toBeGreaterThan(18);
    await tool(page, 'Delete').click().catch(() => undefined);
    if (await clipsOf(page).count() === 2) {
      // the strip was in project mode: select the last clip first, with a tap on the right half
      const b = await tlBox(page);
      const c = await centreOf(clipsOf(page).last());
      await tapAt(page, { x: b.x + b.width / 2 - 20, y: c.y });
      await tool(page, 'Delete').click();
    }
    await expect(clipsOf(page)).toHaveCount(1);
    const t = await readTime(page);
    expect(t.total).toBeGreaterThan(11.5);
    expect(t.now, 'playhead is past the end of the shorter edit').toBeLessThanOrEqual(t.total + 0.05);
    await expectShellStill(page);
  });

  test('deleting the only clip shows the empty state; Undo brings back the same video; a new video can be added; undo and redo work throughout', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await openVideo(page);
    await addClip(page, 'clip.mp4');
    const total0 = (await readTime(page)).total;
    await selectFirst(page);
    await tool(page, 'Delete').click();
    await expect(empty(page)).toBeVisible();
    await expect(page.locator('.pv-tl')).toHaveCount(0);
    await expect(page.getByLabel('Choose a video')).toBeAttached();
    const undo = page.getByRole('button', { name: /Undo: bring the video back/ });
    await expect(undo).toBeVisible();
    await expectShellStill(page);

    await undo.click();
    await expect(clipsOf(page)).toHaveCount(1);
    await expect(empty(page)).toHaveCount(0);
    expect((await readTime(page)).total, 'the restored video has another duration').toBeCloseTo(total0, 1);
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);

    // delete again, then add a different video from the empty state
    await selectFirst(page);
    await tool(page, 'Delete').click();
    await expect(empty(page)).toBeVisible();
    await addClip(page, 'clip2.mp4');
    expect((await readTime(page)).total).toBeGreaterThan(7.5);
    expect((await readTime(page)).total).toBeLessThan(8.6);
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);
    // the new video can be deleted and brought back too
    await selectFirst(page);
    await tool(page, 'Delete').click();
    await expect(empty(page)).toBeVisible();
    await page.getByRole('button', { name: /Undo: bring the video back/ }).click();
    await expect(clipsOf(page)).toHaveCount(1);
    expect((await readTime(page)).total).toBeGreaterThan(7.5);
    expect((await readTime(page)).total).toBeLessThan(8.6);
    expect(errors).toEqual([]);
  });

  test('after deleting the only clip a reload shows the empty state, not the deleted video', async ({ page }) => {
    await openVideo(page);
    await addClip(page, 'clip.mp4');
    await page.waitForTimeout(2500); // the edit is kept a moment after the last change
    await page.reload();
    await expect(clipsOf(page)).toHaveCount(1, { timeout: 30_000 }); // sanity: a reload keeps an existing video
    await selectFirst(page);
    await tool(page, 'Delete').click();
    await expect(empty(page)).toBeVisible();
    await page.waitForTimeout(2500);
    await page.reload();
    await expect(page.locator('.pv')).toBeVisible();
    await expect(empty(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.pv-tl')).toHaveCount(0);
  });
});
