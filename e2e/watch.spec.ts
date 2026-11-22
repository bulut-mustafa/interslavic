import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNotCovered, expectShellStill, expectTappable, fixture, shot, watchErrors } from './helpers';

const ISV = `1
00:00:00,000 --> 00:00:03,000
Dobro jutro, moj prijatelj.

2
00:00:03,500 --> 00:00:06,000
Vidime se zavtra na stanciji.

3
00:00:06,500 --> 00:00:10,000
Hvala vam za vsjo.
`;
const EN = `1
00:00:00,000 --> 00:00:03,000
Good morning, my friend.

2
00:00:03,500 --> 00:00:06,000
See you tomorrow at the station.

3
00:00:06,500 --> 00:00:10,000
Thank you for everything.
`;

const clip = () => ({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: readFileSync(fixture('clip.mp4')) });
const srtFile = (name: string, text: string) => ({ name, mimeType: 'application/x-subrip', buffer: Buffer.from(text) });

/** /api/analyze: every word is a known word with one reading. */
async function mockAnalyze(page: Page, hits: string[] = []): Promise<void> {
  await page.route('**/api/analyze', async (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    hits.push(text);
    const tokens = text.split(/(\s+|[,.!?])/).filter((t) => t !== '').map((t) =>
      /^[\s,.!?]+$/.test(t)
        ? { kind: 'gap', text: t }
        : { kind: 'word', text: t, script: 'latin', normal: t.toLowerCase(), status: 'known', readings: [{ lemma: t.toLowerCase(), pos: 'n.', featSets: [{}], en: [`meaning of ${t}`], ru: [] }], totalReadings: 1, suggestions: [] },
    );
    await route.fulfill({ json: { tokens } });
  });
}

async function openWatch(page: Page): Promise<void> {
  await page.goto('/studio/watch');
  const h264 = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
  test.skip(h264 === '', 'this browser build cannot decode the H.264 fixture (Playwright Chromium has no H.264); covered in WebKit');
  await page.locator('input[type=file]').first().setInputFiles([clip(), srtFile('film.isv.srt', ISV), srtFile('film.en.srt', EN)]);
  await expect(page.locator('.ph-watch video')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current subtitle' })).toBeVisible();
}

test.describe('watch', () => {
  test('empty state: one picker for a video and subtitles, no overflow', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/studio/watch');
    await expect(page.getByText('Drop a video and its subtitles here').or(page.getByText(/Learn from a video/)).first()).toBeVisible();
    const input = page.locator('input[type=file]').first();
    await expect(input).toBeAttached();
    expect(await input.getAttribute('accept')).toContain('.srt');
    expect(await input.getAttribute('multiple')).not.toBeNull();
    await expectShellStill(page);
    expect(errors.filter((e) => !/Button failed to load/.test(e)), 'WebKit native video-control icon noise is ignored').toEqual([]);
  });

  test('video fixed on top (<= 38svh), subtitle under it, files card, no overflow', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockAnalyze(page);
    await openWatch(page);
    const vh = page.viewportSize()!.height;
    const wrap = (await page.locator('.ph-watch-video').boundingBox())!;
    expect(wrap.height, 'video block <= 38svh').toBeLessThanOrEqual(vh * 0.38 + 1);
    expect(wrap.y, 'video is right under the top bar').toBeLessThan(120);
    const v = (await page.locator('.ph-watch video').boundingBox())!;
    expect(v.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // the video block does not scroll away when the words panel scrolls
    await page.locator('.ph-watch-words').evaluate((e) => (e.scrollTop = 500));
    const wrap2 = (await page.locator('.ph-watch-video').boundingBox())!;
    expect(wrap2.y).toBe(wrap.y);
    await page.locator('.ph-watch-words').evaluate((e) => (e.scrollTop = 0));
    // the first line, both subtitle files assigned
    await expect(page.locator('.ph-watch-cue')).toContainText('Dobro jutro, moj prijatelj.');
    await expect(page.locator('.player-original')).toHaveText('Good morning, my friend.');
    await expect(page.getByRole('region', { name: 'Files' })).toContainText('film.isv.srt and film.en.srt');
    await expect(page.getByRole('region', { name: 'Files' })).toContainText('clip.mp4');
    await expectShellStill(page);
    const over = await page.locator('.ph-watch-words').evaluate((e) => e.scrollWidth - e.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
    await shot(page, testInfo, 'watch');
    expect(errors.filter((e) => !/Button failed to load/.test(e)), 'WebKit native video-control icon noise is ignored').toEqual([]);
  });

  test('tap a word: its sheet opens with the dictionary reading, the video pauses, Close works', async ({ page }) => {
    const hits: string[] = [];
    await mockAnalyze(page, hits);
    await openWatch(page);
    const word = page.locator('.ph-watch-cue').getByRole('button', { name: 'prijatelj' });
    await expect(word).toBeVisible();
    expect(hits.length).toBeGreaterThan(0);
    // tap target size: words are inline text in a 1.5rem line, at least the line height tall
    const wb = (await word.boundingBox())!;
    expect(wb.height).toBeGreaterThanOrEqual(24);
    await word.click();
    const sheet = page.getByRole('dialog', { name: 'prijatelj' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('meaning of prijatelj');
    expect(await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expect(word).toHaveClass(/is-active/);
    // the video is still visible above the sheet
    const vb = (await page.locator('.ph-watch video').boundingBox())!;
    const sb = (await sheet.boundingBox())!;
    expect(vb.y + vb.height, 'the sheet does not cover the video').toBeLessThanOrEqual(sb.y + 1);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expectShellStill(page);
  });

  test('sticky controls: next / previous line, repeat, speed, Save sentence', async ({ page }) => {
    await mockAnalyze(page);
    await openWatch(page);
    const bar = page.getByRole('toolbar', { name: 'Watch controls' });
    await expect(bar).toBeVisible();
    await expectTappable(bar, 44);
    await expectNotCovered(bar.getByRole('button', { name: 'Next line' }));
    const cue = page.locator('.ph-watch-cue');
    await expect(bar.getByRole('button', { name: 'Previous line' })).toBeDisabled();
    await bar.getByRole('button', { name: 'Next line' }).click();
    await expect(cue).toContainText('Vidime se zavtra', { timeout: 10_000 });
    await expect(page.locator('.player-original')).toHaveText('See you tomorrow at the station.');
    const t = await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t).toBeGreaterThanOrEqual(3.4);
    await bar.getByRole('button', { name: 'Next line' }).click();
    await expect(cue).toContainText('Hvala vam', { timeout: 10_000 });
    await expect(bar.getByRole('button', { name: 'Next line' })).toBeDisabled();
    await bar.getByRole('button', { name: 'Previous line' }).click();
    await expect(cue).toContainText('Vidime se zavtra', { timeout: 10_000 });
    // repeat toggles
    const rep = bar.getByRole('button', { name: 'Repeat this line' });
    await rep.click();
    await expect(bar.getByRole('button', { name: 'Stop repeating' })).toHaveAttribute('aria-pressed', 'true');
    await bar.getByRole('button', { name: 'Stop repeating' }).click();
    await expect(bar.getByRole('button', { name: 'Repeat this line' })).toBeVisible();
    // speed cycles and is applied to the video
    const speed = bar.getByRole('button', { name: /^Speed/ });
    await expect(speed).toHaveText('1×');
    await speed.click();
    await expect(speed).toHaveText('1.25×');
    expect(await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.25);
    await speed.click();
    await expect(speed).toHaveText('0.5×');
    await speed.click();
    await speed.click();
    await expect(speed).toHaveText('1×');
    // Save sentence adds to the saved list
    await expect(page.getByRole('region', { name: 'Saved sentences' })).toHaveCount(0);
    await bar.getByRole('button', { name: /Save sentence/ }).click();
    const saved = page.getByRole('region', { name: 'Saved sentences' });
    await page.locator('.ph-watch-words').evaluate((e) => (e.scrollTop = e.scrollHeight));
    await expect(saved).toContainText('Saved sentences (1)');
    await expect(saved).toContainText('Vidime se zavtra na stanciji.');
    await expect(saved).toContainText('film.isv.srt'.slice(0, 0) + 'clip.mp4');
    await expect(saved.getByRole('button', { name: 'Anki: Interslavic first' })).toBeVisible();
    // remove it again
    await saved.getByRole('button', { name: /^Remove:/ }).click();
    await expect(page.getByRole('region', { name: 'Saved sentences' })).toHaveCount(0);
    await expectShellStill(page);
  });

  test('Repeat keeps the video inside the line', async ({ page }) => {
    await mockAnalyze(page);
    await openWatch(page);
    const bar = page.getByRole('toolbar', { name: 'Watch controls' });
    await bar.getByRole('button', { name: 'Next line' }).click();
    await expect(page.locator('.ph-watch-cue')).toContainText('Vidime se zavtra', { timeout: 10_000 });
    await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.pause());
    await bar.getByRole('button', { name: 'Repeat this line' }).click();
    await expect(bar.getByRole('button', { name: 'Stop repeating' })).toBeVisible();
    await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.play());
    const times: number[] = [];
    for (let i = 0; i < 12; i++) {
      times.push(await page.locator('.ph-watch video').evaluate((v: HTMLVideoElement) => v.currentTime));
      await page.waitForTimeout(400);
    }
    // 4.8 s of wall time on a 2.5 s line: it must have looped, and never run on into the next line
    expect(Math.max(...times)).toBeLessThan(6.3);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(3.1);
  });

  test('Swap subtitles exchanges the two files; subtitles-only and video-only states say what is missing', async ({ page }) => {
    await mockAnalyze(page);
    await openWatch(page);
    await page.getByRole('button', { name: /Swap subtitles/ }).click();
    await expect(page.locator('.ph-watch-cue')).toContainText('Good morning, my friend.');
    await expect(page.getByRole('region', { name: 'Files' })).toContainText('film.en.srt and film.isv.srt');
    // video only
    await page.goto('/studio/watch');
    await page.locator('input[type=file]').first().setInputFiles(clip());
    await expect(page.getByText('Add the Interslavic subtitles (an .srt) to see them here.')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Watch controls' })).toHaveCount(0);
    // then add subtitles through Add files
    await page.getByLabel('Video and subtitle files').last().setInputFiles(srtFile('x.srt', ISV));
    await expect(page.getByRole('toolbar', { name: 'Watch controls' })).toBeVisible();
    // subtitles only
    await page.goto('/studio/watch');
    await page.locator('input[type=file]').first().setInputFiles(srtFile('only.srt', ISV));
    await expect(page.getByText('Add the video to watch it with the subtitles.')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Watch controls' })).toHaveCount(0);
    await expectShellStill(page);
  });

  test('a failing /api/analyze shows an error line, the words stay readable', async ({ page }) => {
    await page.route('**/api/analyze', (r) => r.fulfill({ status: 500, json: { error: 'The reader is not answering.' } }));
    await openWatch(page);
    await expect(page.locator('.ph-watch-words')).toContainText('The reader is not answering.');
    await expect(page.locator('.ph-watch-cue')).toContainText('Dobro jutro');
    await expect(page.getByRole('toolbar', { name: 'Watch controls' })).toBeVisible();
  });

  for (const w of [320, 360, 390, 430]) {
    test(`at ${w}px: shell still, controls tappable, bar not covered`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.setViewportSize({ width: w, height: 740 });
      await mockAnalyze(page);
      await openWatch(page);
      await expectShellStill(page);
      const bar = page.getByRole('toolbar', { name: 'Watch controls' });
      await expectTappable(bar, 44);
      for (const b of await bar.getByRole('button').all()) await expectNotCovered(b);
      // the controls fit in one row inside the screen
      const rects = await bar.getByRole('button').evaluateAll((a) => a.map((x) => x.getBoundingClientRect()));
      for (const r of rects) {
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(w + 0.5);
      }
      expect(new Set(rects.map((r) => Math.round((r.top + r.bottom) / 2 / 8))).size, 'controls wrap onto more than one row').toBe(1);
      const over = await page.locator('.ph-watch-words').evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      const word = page.locator('.ph-watch-cue').getByRole('button').first();
      await word.click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expectTappable(sheet.locator('.ph-sheet-head'));
      await expectShellStill(page);
      expect(errors.filter((e) => !/Button failed to load/.test(e)), 'WebKit native video-control icon noise is ignored').toEqual([]);
    });
  }
});
