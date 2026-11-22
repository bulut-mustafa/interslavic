import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNotCovered, expectShellStill, expectTappable, fixture, shot, watchErrors } from './helpers';

const f = (name: string, mimeType: string) => ({ name, mimeType, buffer: readFileSync(fixture(name)) });
const PNG = () => f('sign.png', 'image/png');
const MP4 = () => f('clip.mp4', 'video/mp4');
const WAV = () => f('tone.wav', 'audio/wav');

const uploads = (page: Page) => page.getByRole('region', { name: 'Your uploads' });

async function addAll(page: Page): Promise<void> {
  await page.goto('/studio');
  await uploads(page).getByLabel('Add to uploads').setInputFiles([PNG(), MP4(), WAV()]);
  await expect(uploads(page).getByRole('button', { name: /^Open / })).toHaveCount(3);
}

test.describe('uploads', () => {
  test('Studio home: tool cards, empty uploads row with a hint, Add control', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/studio');
    const up = uploads(page);
    await expect(up).toBeVisible();
    await expect(up.getByText('Nothing here yet')).toBeVisible();
    await expect(up.getByLabel('Add to uploads')).toHaveAttribute('accept', 'image/*,video/*,audio/*');
    const add = up.locator('.ph-upload-add');
    const b = (await add.boundingBox())!;
    expect(Math.min(b.width, b.height), 'Add tile is a real tap target').toBeGreaterThanOrEqual(44);
    for (const tool of ['Photo', 'Video', 'Recording', 'Subtitles', 'Watch', 'Worksheets']) await expect(page.getByRole('link', { name: `Open ${tool}` })).toBeVisible();
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('add files: a tile per file, picture shows itself, the hint goes away', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await addAll(page);
    const up = uploads(page);
    await expect(up.getByText('Nothing here yet')).toHaveCount(0);
    await expect(up.getByRole('button', { name: 'Open sign.png' }).locator('img')).toBeVisible();
    await expect(up.getByRole('button', { name: 'Open tone.wav' })).toContainText('♪');
    await expect(up.getByRole('button', { name: 'Open clip.mp4' })).toBeVisible();
    // image really loaded
    await expect.poll(() => up.getByRole('button', { name: 'Open sign.png' }).locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    for (const t of await up.getByRole('button', { name: /^Open / }).all()) {
      const bb = (await t.boundingBox())!;
      expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
    }
    await expectShellStill(page);
    await shot(page, testInfo, 'uploads-home');
    expect(errors).toEqual([]);
  });

  test('the row scrolls sideways inside itself, the page does not', async ({ page }) => {
    await page.goto('/studio');
    const files = Array.from({ length: 9 }, (_, i) => ({ name: `pic${i}.png`, mimeType: 'image/png', buffer: readFileSync(fixture('sign.png')) }));
    // distinct sizes so none counts as a duplicate
    const distinct = files.map((x, i) => ({ ...x, buffer: Buffer.concat([x.buffer, Buffer.alloc(i + 1)]) }));
    await uploads(page).getByLabel('Add to uploads').setInputFiles(distinct);
    await expect(uploads(page).getByRole('button', { name: /^Open pic/ })).toHaveCount(9);
    await expectShellStill(page);
    const row = await uploads(page).locator('.ph-uploads-row').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, o: getComputedStyle(e).overflowX }));
    expect(row.sw).toBeGreaterThan(row.cw);
    expect(row.o).toMatch(/auto|scroll/);
  });

  test('tap a picture: the Photo editor opens with it; tap a video: the Video editor opens with it', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await addAll(page);
    await uploads(page).getByRole('button', { name: 'Open sign.png' }).click();
    await expect(page).toHaveURL(/\/studio\/photo/);
    await expect(page.locator('[data-tool="photo"]')).toBeVisible();
    // the picture arrived: the editor leaves its empty state (an upload prompt is gone)
    await expect(page.locator('[data-tool="photo"] canvas, [data-tool="photo"] img, [data-tool="photo"] svg.pp-stage, [data-tool="photo"] .pp-canvas').first()).toBeVisible({ timeout: 15_000 });
    await expectShellStill(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/studio\/?$/);
    await expect(uploads(page).getByRole('button', { name: /^Open / })).toHaveCount(3);
    const h264 = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
    if (h264 === '') {
      // Playwright's Chromium cannot decode H.264: the clip tile still opens the Video editor, but the clip cannot load.
      await uploads(page).getByRole('button', { name: 'Open clip.mp4' }).click();
      await expect(page).toHaveURL(/\/studio\/video/);
      await expectShellStill(page);
      return;
    }
    await uploads(page).getByRole('button', { name: 'Open clip.mp4' }).click();
    await expect(page).toHaveURL(/\/studio\/video/);
    await expect(page.locator('[data-tool="video"]')).toBeVisible();
    await expect(page.getByTestId('phone-video-empty'), 'the clip arrived: no empty state').toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-tool="video"] video, [data-tool="video"] canvas').first()).toBeVisible({ timeout: 15_000 });
    await expectShellStill(page);
    expect(errors.filter((e) => !/Button failed to load/.test(e))).toEqual([]);
  });

  test('inside Photo and Video the top bar has an Uploads button; the sheet lists the files, opens them, removes them', async ({ page }) => {
    await addAll(page);
    await page.getByRole('link', { name: 'Open Photo' }).click();
    await expect(page).toHaveURL(/\/studio\/photo/);
    const btn = page.getByRole('button', { name: 'Uploads' });
    await expect(btn).toBeVisible();
    const bb = (await btn.boundingBox())!;
    expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
    await expectNotCovered(btn);
    await btn.click();
    const sheet = page.getByRole('dialog', { name: 'Uploads' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Add to uploads')).toBeAttached();
    await expect(sheet.getByRole('button', { name: /^Open / })).toHaveCount(3);
    await expectTappable(sheet.locator('.uploads-sheet'), 36);
    // remove the sound
    await sheet.getByRole('button', { name: 'Remove tone.wav from uploads' }).click();
    await expect(sheet.getByRole('button', { name: /^Open / })).toHaveCount(2);
    await expect(sheet.getByRole('button', { name: 'Open tone.wav' })).toHaveCount(0);
    // add a file from the sheet
    await sheet.getByLabel('Add to uploads').setInputFiles({ name: 'sign.png', mimeType: 'image/png', buffer: Buffer.concat([readFileSync(fixture('sign.png')), Buffer.from('x')]) });
    await expect(sheet.getByRole('button', { name: /^Open / })).toHaveCount(3);
    // a wrong kind of file is refused with a message
    await sheet.getByLabel('Add to uploads').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(sheet.getByRole('alert')).toContainText('not a picture, a video or a sound');
    // opening a video from here goes to the Video editor
    await sheet.getByRole('button', { name: 'Open clip.mp4' }).click();
    await expect(page).toHaveURL(/\/studio\/video/);
    // close the sheet with Done/Close, then it can be re-opened from the Video bar
    await expect(page.getByRole('button', { name: 'Uploads' }).first()).toBeVisible();
    await expectShellStill(page);
  });

  test('removing every upload brings the empty hint back on Studio home', async ({ page }) => {
    await addAll(page);
    await page.getByRole('link', { name: 'Open Photo' }).click();
    await page.getByRole('button', { name: 'Uploads' }).click();
    const sheet = page.getByRole('dialog', { name: 'Uploads' });
    for (const n of ['sign.png', 'clip.mp4', 'tone.wav']) await sheet.getByRole('button', { name: `Remove ${n} from uploads` }).click();
    await expect(sheet.getByText(/appear here, ready to use again/)).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Nothing here yet')).toBeVisible();
  });

  test('tools that do not use uploads have no Uploads button', async ({ page }) => {
    await page.goto('/studio/worksheets');
    await expect(page.getByRole('button', { name: 'Uploads' })).toHaveCount(0);
    await page.goto('/studio/subtitles');
    await expect(page.getByRole('button', { name: 'Uploads' })).toHaveCount(0);
  });

  for (const w of [320, 360, 390, 430]) {
    test(`at ${w}px: Studio home and the Uploads sheet fit, shell still, tappable`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.setViewportSize({ width: w, height: 740 });
      await addAll(page);
      await expectShellStill(page);
      await expectTappable(page.locator('.ph-studio-home'), 44);
      const over = await page.locator('.ph-content').evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      await page.getByRole('link', { name: 'Open Photo' }).click();
      await page.getByRole('button', { name: 'Uploads' }).click();
      const sheet = page.getByRole('dialog', { name: 'Uploads' });
      await expect(sheet).toBeVisible();
      await expectTappable(sheet.locator('.ph-sheet-head'));
      const inside = await sheet.evaluate((s) => {
        const w = innerWidth;
        return [...s.querySelectorAll<HTMLElement>('button, label')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.right > w + 1 || r.left < -1).length;
      });
      expect(inside, 'controls beyond the screen edge').toBe(0);
      await expectShellStill(page);
      expect(errors).toEqual([]);
    });
  }
});
