import { expect, type Locator, type Page } from '@playwright/test';
import { fixture, iosKeyboard } from './helpers';

export const strip = (page: Page): Locator => page.getByRole('toolbar', { name: 'Photo tools' });
export const tool = (page: Page, name: string): Locator => strip(page).getByRole('button', { name, exact: true });
export const sheet = (page: Page): Locator => page.locator('.ph-sheet');
export const stage = (page: Page): Locator => page.locator('.pp-stage');

/** Opens the Photo tool on a phone with the empty state showing. */
export async function gotoPhoto(page: Page): Promise<void> {
  await page.goto('/studio/photo');
  await expect(page.locator('.ph-photo-empty')).toBeVisible();
}

/** Opens Photo and uploads a fixture through the picker; waits for the editor (tool strip). */
export async function openFixture(page: Page, name = 'sign.png'): Promise<void> {
  await gotoPhoto(page);
  await page.getByLabel('Photo', { exact: true }).setInputFiles(fixture(name));
  await expect(strip(page)).toBeVisible({ timeout: 20_000 });
}

export async function openSample(page: Page): Promise<void> {
  await gotoPhoto(page);
  await page.getByRole('button', { name: 'Try a sample picture' }).click();
  await expect(strip(page)).toBeVisible({ timeout: 20_000 });
}

/** Opens a tool on the strip and waits for the sheet. */
export async function openTool(page: Page, name: string): Promise<void> {
  await tool(page, name).click();
  await expect(sheet(page)).toBeVisible();
}

export interface SavedLayer {
  id: string;
  text?: string;
  x: number;
  y: number;
  src?: string;
  w?: number;
  h?: number;
  cx?: number;
  cy?: number;
  style?: { size: number; color: string; font: string };
  original?: string;
  erase?: unknown;
  hidden?: boolean;
  locked?: boolean;
  shape?: string;
}
export interface SavedPage {
  id: string;
  name: string;
  layers: SavedLayer[];
  past: number;
  base: unknown;
  record: Record<string, unknown>;
}

/** Reads what the editor keeps in IndexedDB (written ~250 ms after each change): every page in order, with its current layers. */
export async function savedPages(page: Page): Promise<SavedPage[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('interslavic-studio', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const get = <T,>(k: string): Promise<T | undefined> =>
      new Promise((res, rej) => {
        const r = db.transaction('kv').objectStore('kv').get(k);
        r.onsuccess = () => res(r.result as T);
        r.onerror = () => rej(r.error);
      });
    const meta = await get<{ order: string[] }>('photo:meta');
    const out = [];
    for (const id of meta?.order ?? []) {
      const rec = await get<{ name: string; hist: { past: unknown[]; present: { layers: SavedLayer[]; base: unknown } } }>(`photo:page:${id}`);
      if (rec) out.push({ id, name: rec.name, layers: rec.hist.present.layers, past: rec.hist.past.length, base: rec.hist.present.base, record: rec as unknown as Record<string, unknown> });
    }
    db.close();
    return out;
  });
}

/** The layers of the page that is shown (the first page when only one), once the save has caught up with `ok`. */
export async function layersWhen(page: Page, ok: (l: SavedLayer[]) => boolean, pageIndex = 0): Promise<SavedLayer[]> {
  let last: SavedLayer[] = [];
  await expect
    .poll(async () => {
      last = (await savedPages(page))[pageIndex]?.layers ?? [];
      return ok(last);
    }, { timeout: 8000, message: 'saved layers never matched' })
    .toBe(true);
  return last;
}

/** Page-pixel size of the picture the canvas shows (the canvas's own pixel size) and where it is on screen. */
export async function canvasMap(page: Page): Promise<{ left: number; top: number; k: number; w: number; h: number }> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.pp-wrap canvas')!;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, k: r.width / c.width, w: c.width, h: c.height };
  });
}

/** Screen point of a page-pixel point. */
export async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const m = await canvasMap(page);
  return { x: m.left + x * m.k, y: m.top + y * m.k };
}

/** A real finger tap at a screen point. */
export async function tapAt(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.touchscreen.tap(p.x, p.y);
}

/** Add > Text (a "Your text" layer, selected), then Edit, type `text`, Done. No keyboard emulation unless `kb` > 0. */
export async function addTypedText(page: Page, text: string, kb = 0): Promise<void> {
  await openTool(page, 'Add');
  await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await tool(page, 'Edit').click();
  if (kb) await iosKeyboard(page, kb);
  const box = page.locator('.canvas-typing');
  await expect(box).toBeVisible();
  await box.fill(text);
  await page.getByRole('toolbar', { name: 'Text tools' }).or(page.locator('.canvas-typing')).first().waitFor();
  if (kb) await page.getByRole('toolbar', { name: 'Text tools' }).getByRole('button', { name: 'Done' }).click();
  else await box.evaluate((e) => (e as HTMLTextAreaElement).blur());
  await expect(page.locator('.canvas-typing')).toHaveCount(0);
  if (kb) await iosKeyboard(page, 0);
}

/** Taps an empty spot of the picture (its bottom edge) to deselect everything. */
export async function tapEmpty(page: Page): Promise<void> {
  const c = await page.locator('.pp-wrap canvas').boundingBox();
  await tapAt(page, { x: c!.x + c!.width * 0.5, y: c!.y + c!.height * 0.97 });
}

/** A real horizontal swipe on an element: touch events through CDP on Chromium, wheel on WebKit (Playwright has no touch scrolling there). */
export async function swipeX(page: Page, loc: Locator, dx: number): Promise<void> {
  const b = (await loc.boundingBox())!;
  const y = b.y + b.height / 2;
  const x0 = dx < 0 ? b.x + b.width - 20 : b.x + 20;
  const browserName = page.context().browser()!.browserType().name();
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizeScrollGesture', { x: x0, y, xDistance: dx, yDistance: 0, gestureSourceType: 'touch', speed: 800 });
    await cdp.detach();
  } else {
    // Mobile WebKit under Playwright has neither touch scrolling nor wheel: check the strip is a horizontal touch scroller, then scroll it by script.
    const css = await loc.evaluate((e) => ({ ox: getComputedStyle(e).overflowX, ta: getComputedStyle(e).touchAction }));
    expect(css.ox, 'a horizontal scroller').toMatch(/auto|scroll/);
    expect(css.ta, 'a finger can pan it sideways').toMatch(/pan-x|auto|manipulation/);
    await loc.evaluate((e, d) => e.scrollBy({ left: -d, behavior: 'instant' }), dx);
  }
  await page.waitForTimeout(350);
}
