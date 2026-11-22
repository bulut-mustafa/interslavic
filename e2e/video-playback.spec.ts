import { test, expect } from '@playwright/test';
import { mockApi, watchErrors } from './helpers';
import { addClip, canvasInfo, keyboardSeek, longTasks, openVideo, readPerf, readTime, watchLongTasks } from './video-helpers';

const play = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Play' });
const pause = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Pause' });

test.beforeEach(() => test.setTimeout(120_000)); // video decoding is slow on a loaded machine

test.describe('video: playback', () => {
  test('play advances the time monotonically past 2 s, pause stops it, the picture changes while playing', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openVideo(page);
    await addClip(page);
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);

    await play(page).click();
    await expect(pause(page)).toBeVisible();
    const times: number[] = [];
    const hashes = new Set<number>();
    for (let i = 0; i < 12; i++) {
      times.push((await readTime(page)).now);
      hashes.add((await canvasInfo(page)).hash);
      await page.waitForTimeout(250);
    }
    for (let i = 1; i < times.length; i++) expect(times[i]!, `time went backwards: ${times.join(',')}`).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(times.at(-1)!, `times ${times.join(',')}`).toBeGreaterThan(2);
    expect(hashes.size, 'the preview frame never changed while playing').toBeGreaterThan(3);

    await pause(page).click();
    await expect(play(page)).toBeVisible();
    const at = (await readTime(page)).now;
    await page.waitForTimeout(1200);
    expect((await readTime(page)).now, 'time kept running after pause').toBeCloseTo(at, 1);
    const h1 = (await canvasInfo(page)).hash;
    await page.waitForTimeout(500);
    expect((await canvasInfo(page)).hash, 'picture kept changing after pause').toBe(h1);
    expect(errors).toEqual([]);
  });

  test('perf: 5 s of playback stays within the render, corrective seek and long task budgets', async ({ page, browserName }) => {
    await mockApi(page);
    await openVideo(page, '?perf=1');
    await addClip(page);
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);
    await watchLongTasks(page);
    await play(page).click();
    await waitTimeAfter(page, 0.3);
    const samples: Record<string, number>[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      samples.push(await readPerf(page));
    }
    await pause(page).click();
    const t = (await readTime(page)).now;
    expect(t, 'playback did not run for 5 s').toBeGreaterThan(4);
    // the overlay counts per whole second and its first windows still contain the tap on Play (a seek and a few extra renders): judge steady playback
    const steady = samples.slice(3);
    const max = (k: string) => Math.max(...steady.map((s) => s[k] ?? 0));
    expect(max('draw'), `overlay never reported draws: ${JSON.stringify(samples.at(-1))}`).toBeGreaterThan(5);
    expect(max('render'), `React renders per second ${JSON.stringify(samples)}`).toBeLessThanOrEqual(10);
    expect(max('fix'), `corrective seeks per second ${JSON.stringify(samples)}`).toBeLessThanOrEqual(1);
    const long = await longTasks(page);
    if (long === null) test.info().annotations.push({ type: 'note', description: `${browserName}: PerformanceObserver longtask unsupported, long-task budget not checked` });
    else expect(Math.max(0, ...long), `long tasks (ms): ${long.join(',')}`).toBeLessThan(250);
  });

  test('playback crosses the boundary between two clips without stalling', async ({ page }) => {
    await mockApi(page);
    await openVideo(page, '?perf=1');
    await addClip(page, 'clip2.mp4'); // 8 s first, so the boundary is reachable quickly
    await addClip(page, 'clip.mp4');
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50);
    // park the playhead 2 s before the boundary (adding a clip leaves the playhead at that clip's start, so go back)
    expect(await keyboardSeek(page, 6)).toBeCloseTo(6, 0);
    await expect.poll(async () => (await canvasInfo(page)).lit, { timeout: 15_000 }).toBeGreaterThan(50); // the first clip's picture is back after the seek
    await play(page).click();
    const seen: number[] = [];
    const hashes = new Set<number>();
    for (let i = 0; i < 20; i++) {
      seen.push((await readTime(page)).now);
      hashes.add((await canvasInfo(page)).hash);
      await page.waitForTimeout(250);
    }
    await pause(page).click().catch(() => undefined);
    expect(seen.at(-1)!, `did not cross the 8 s boundary: ${seen.join(',')}`).toBeGreaterThan(8.8);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    // no stall: the time never stood still for 1 s in a row while playing
    for (let i = 4; i < seen.length && seen[i]! < 19.5; i++) expect(seen[i]! - seen[i - 4]!, `stalled around ${seen[i]}: ${seen.join(',')}`).toBeGreaterThan(0.5);
    expect(hashes.size, 'the picture froze after the clip boundary').toBeGreaterThan(2);
  });

  test('playback across three clips reaches the end and stops there', async ({ page }) => {
    await mockApi(page);
    await openVideo(page);
    await addClip(page, 'clip2.mp4');
    await addClip(page, 'clip2.mp4');
    await addClip(page, 'clip2.mp4');
    const total = (await readTime(page)).total;
    expect(total).toBeGreaterThan(23);
    expect(await keyboardSeek(page, 6)).toBeCloseTo(6, 0); // two boundaries ahead: 8 s and 16 s
    await play(page).click();
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      seen.push((await readTime(page)).now);
      if (seen.at(-1)! > 17.5) break;
      await page.waitForTimeout(250);
    }
    expect(seen.at(-1)!, `stuck at ${seen.at(-1)} (${seen.join(',')})`).toBeGreaterThan(17.5);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  test('playback reaches the end of a clip, stops, and pressing play again restarts from the beginning', async ({ page }) => {
    await mockApi(page);
    await openVideo(page);
    await addClip(page, 'clip2.mp4');
    expect(await keyboardSeek(page, 7)).toBeCloseTo(7, 0);
    await play(page).click();
    await expect(play(page)).toBeVisible({ timeout: 10_000 }); // ended: the button flips back to Play
    const end = await readTime(page);
    expect(end.now).toBeGreaterThan(end.total - 0.3);
    await play(page).click();
    await expect.poll(async () => (await readTime(page)).now, { timeout: 5_000 }).toBeLessThan(2);
    await pause(page).click();
  });
});

async function waitTimeAfter(page: import('@playwright/test').Page, s: number): Promise<void> {
  await expect.poll(async () => (await readTime(page)).now, { timeout: 10_000 }).toBeGreaterThan(s);
}
