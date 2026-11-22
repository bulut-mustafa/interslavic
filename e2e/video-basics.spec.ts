import { test, expect } from '@playwright/test';
import { expectShellStill, fixture, mockApi, watchErrors } from './helpers';
import { addClip, canvasInfo, clipsOf, openVideo, readTime } from './video-helpers';

test.beforeEach(() => test.setTimeout(120_000)); // video decoding is slow on a loaded machine

test.describe('video: empty state and adding clips', () => {
  test('empty state offers a working Choose a video; clip.mp4 gives one 12 s clip with a drawn frame', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openVideo(page);
    await expect(page.getByRole('heading', { name: 'Add a video to start' })).toBeVisible();
    await expect(page.getByText('Choose a video')).toBeVisible();
    await expect(page.locator('.pv-tl')).toHaveCount(0); // no timeline in the empty state
    await expectShellStill(page);

    await page.getByLabel('Choose a video').setInputFiles(fixture('clip.mp4'));
    await expect(clipsOf(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Add a video to start' })).toHaveCount(0);
    const t = await readTime(page);
    expect(t.total).toBeGreaterThan(11.5);
    expect(t.total).toBeLessThan(12.6);
    expect(t.now).toBe(0);
    await expect(page.locator('.pv-clip-len')).toHaveText('12s');

    // the preview shows a real frame, not a blank canvas
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);
    const c = await canvasInfo(page);
    expect(c.w).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });

  test('a second video is appended: two clips, total about 20 s', async ({ page }) => {
    await mockApi(page);
    await openVideo(page);
    await addClip(page, 'clip.mp4');
    await addClip(page, 'clip2.mp4');
    await expect(clipsOf(page)).toHaveCount(2);
    const t = await readTime(page);
    expect(t.total).toBeGreaterThan(19.3);
    expect(t.total).toBeLessThan(20.8);
    // the clips sit side by side on the main track, in upload order (the second starts where the first ends)
    const [a, b] = await Promise.all([clipsOf(page).nth(0).boundingBox(), clipsOf(page).nth(1).boundingBox()]);
    expect(b!.x).toBeGreaterThanOrEqual(a!.x + a!.width - 2);
    await expect(page.getByRole('button', { name: 'Transition between clip 1 and clip 2' })).toHaveCount(1);
  });
});
