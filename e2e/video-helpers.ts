import { expect, type Locator, type Page } from '@playwright/test';
import { fixture } from './helpers';

/** Helpers shared by the phone Video editor specs (video-*.spec.ts). */

export const VIDEO_URL = '/studio/video';

/** Opens the phone Video editor with an empty project (fresh browser context = empty IndexedDB). */
export async function openVideo(page: Page, search = ''): Promise<void> {
  await page.goto(VIDEO_URL + search);
  await expect(page.locator('.pv')).toBeVisible();
}

export const clipsOf = (page: Page): Locator => page.locator('.pv-tl .pv-clip');

/** Uploads a fixture with whichever file input the editor currently offers for the main track. */
export async function addClip(page: Page, name = 'clip.mp4'): Promise<void> {
  const before = await clipsOf(page).count();
  const empty = page.getByRole('heading', { name: 'Add a video to start' });
  if (await empty.isVisible().catch(() => false)) await page.getByLabel('Choose a video').setInputFiles(fixture(name));
  else await page.getByLabel('Add a video, picture or sound').setInputFiles(fixture(name));
  await expect(clipsOf(page)).toHaveCount(before + 1, { timeout: 30_000 });
}

/** The two numbers of "0:03.2 / 0:12.0" in seconds. */
export async function readTime(page: Page): Promise<{ now: number; total: number }> {
  const txt = (await page.locator('.pv-time').innerText()).replace(/\s+/g, ' ');
  const m = txt.match(/(\d+):(\d+\.\d) \/ (\d+):(\d+\.\d)/);
  if (!m) throw new Error(`cannot read the time from "${txt}"`);
  return { now: +m[1]! * 60 + +m[2]!, total: +m[3]! * 60 + +m[4]! };
}

/** Pixels per second of the timeline (the content element carries it). */
export async function readZoom(page: Page): Promise<number> {
  return Number(await page.locator('.pv-tl-content[data-px-per-second]').first().getAttribute('data-px-per-second'));
}

/** A cheap hash of the preview canvas pixels (sampled grid) plus how many sampled pixels are not black/transparent. */
export async function canvasInfo(page: Page): Promise<{ hash: number; lit: number; w: number; h: number }> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.pv-frame canvas');
    if (!c) return { hash: 0, lit: 0, w: 0, h: 0 };
    const ctx = c.getContext('2d')!;
    const { width: w, height: h } = c;
    const data = ctx.getImageData(0, 0, w, h).data;
    let hash = 17;
    let lit = 0;
    const stepY = Math.max(1, Math.floor(h / 24));
    const stepX = Math.max(1, Math.floor(w / 32));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
        hash = (hash * 31 + r * 3 + g * 5 + b * 7 + a) | 0;
        if (a > 0 && r + g + b > 30) lit++;
      }
    }
    return { hash, lit, w, h };
  });
}

/** Centre of an element on screen. */
export async function centreOf(loc: Locator): Promise<{ x: number; y: number }> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('element has no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export async function tlBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await page.locator('.pv-tl').boundingBox();
  if (!b) throw new Error('no timeline');
  return b;
}

/** Tap (real mouse click) on a point. */
export async function tapAt(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.mouse.click(p.x, p.y);
}

/** Press, hold ~600 ms, then drag with the real mouse (the app's long press is 450 ms). */
export async function longPressDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

export const strip = (page: Page): Locator => page.getByRole('toolbar', { name: 'Video tools' });
export const tool = (page: Page, label: string): Locator => strip(page).getByRole('button', { name: label, exact: true });
export const sheet = (page: Page, title?: string): Locator => (title ? page.getByRole('dialog', { name: title }) : page.locator('.ph-sheet'));

/** Opens a strip tool's sheet and waits for it. */
export async function openTool(page: Page, label: string, title = label): Promise<Locator> {
  await tool(page, label).click();
  const s = sheet(page, title);
  await expect(s).toBeVisible();
  return s;
}

/** Reads the perf overlay's per-second line: { render, draw, frame, tick, fix, seek }. */
export async function readPerf(page: Page): Promise<Record<string, number>> {
  const t = await page.locator('.perf-overlay').innerText();
  const m = t.match(/render (\d+) draw (\d+) frame (\d+) tick (\d+) fix (\d+) seek (\d+)/);
  if (!m) return {};
  return { render: +m[1]!, draw: +m[2]!, frame: +m[3]!, tick: +m[4]!, fix: +m[5]!, seek: +m[6]! };
}

/** Installs a long-task recorder (call before the interaction), read it with longTasks(). */
export async function watchLongTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __long?: number[] };
    w.__long = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long!.push(e.duration))).observe({ entryTypes: ['longtask'] });
    } catch {
      w.__long = undefined; // not supported (WebKit): the caller records that
    }
  });
}
export const longTasks = (page: Page): Promise<number[] | null> => page.evaluate(() => (window as unknown as { __long?: number[] }).__long ?? null);

/** Keeps the "play" tests honest across browsers: waits until the time label moves past `s` seconds. */
export async function waitTime(page: Page, pred: (t: number) => boolean, timeout = 15_000): Promise<number> {
  let last = 0;
  await expect.poll(async () => (last = (await readTime(page)).now), { timeout }).toSatisfy(pred);
  return last;
}

/** Moves the playhead to about `target` seconds with the timeline's arrow keys (Shift = 1 s, plain = 0.1 s). */
export async function keyboardSeek(page: Page, target: number): Promise<number> {
  await page.locator('.pv-tl-surface').focus();
  let now = (await readTime(page)).now;
  for (let guard = 0; guard < 60 && Math.abs(now - target) >= 0.95; guard++) {
    await page.keyboard.press(now < target ? 'Shift+ArrowRight' : 'Shift+ArrowLeft');
    now = (await readTime(page)).now;
  }
  for (let guard = 0; guard < 12 && Math.abs(now - target) >= 0.15; guard++) {
    await page.keyboard.press(now < target ? 'ArrowRight' : 'ArrowLeft');
    now = (await readTime(page)).now;
  }
  return now;
}
