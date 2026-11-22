import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const fixture = (name: string): string => join(FIXTURES, name);

/** Mocks the translator API (the Python parser is not running in tests). Returns a log of the requests the app made. */
export async function mockApi(page: Page, opts: { fail?: boolean; delayMs?: number } = {}): Promise<{ batch: unknown[]; single: unknown[] }> {
  const log = { batch: [] as unknown[], single: [] as unknown[] };
  await page.route('**/api/translate-batch*', async (route) => {
    const body = route.request().postDataJSON() as { lines?: string[] };
    log.batch.push(body);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail) return route.abort('failed');
    await route.fulfill({ json: { results: (body.lines ?? []).map((l) => ({ text: l.replace(/Good morning/i, 'Dobro jutro').replace(/my friend/i, 'moj prijatelj'), flagged: false, reasons: [] })) } });
  });
  await page.route('**/api/translate', async (route) => {
    log.single.push(route.request().postDataJSON());
    if (opts.fail) return route.abort('failed');
    await route.fulfill({ json: { sentences: [{ source: 'x', lang: 'en', text: 'Dobro utro', words: [] }] } });
  });
  return log;
}

/** Emulates iOS: window.innerHeight stays the same, only visualViewport.height shrinks (a real keyboard does this), then fires resize. */
export async function iosKeyboard(page: Page, kb: number): Promise<void> {
  await page.evaluate((kb) => {
    const w = window as unknown as { __vvBase?: number };
    const vv = window.visualViewport!;
    w.__vvBase ??= vv.height;
    const h = kb > 0 ? w.__vvBase - kb : w.__vvBase;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    vv.dispatchEvent(new Event('resize'));
  }, kb);
  await page.waitForTimeout(450);
}

/** One-finger drag as pointer events with pointerType 'touch' (Playwright has no WebKit multi-touch). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  await page.evaluate(
    async ({ from, to, steps }) => {
      const el = document.elementFromPoint(from.x, from.y);
      if (!el) throw new Error(`nothing at ${from.x},${from.y}`);
      const mk = (type: string, x: number, y: number) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 });
      el.dispatchEvent(mk('pointerdown', from.x, from.y));
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        (document.elementFromPoint(x, y) ?? el).dispatchEvent(mk('pointermove', x, y));
        await new Promise((r) => setTimeout(r, 16));
      }
      el.dispatchEvent(mk('pointerup', to.x, to.y));
    },
    { from, to, steps },
  );
}

/** Two-finger pinch/rotate with synthetic touch pointers around a centre; `scale` > 1 spreads the fingers. */
export async function pinch(page: Page, centre: { x: number; y: number }, from: number, to: number, steps = 10): Promise<void> {
  await page.evaluate(
    async ({ c, from, to, steps }) => {
      const el = document.elementFromPoint(c.x, c.y);
      if (!el) throw new Error('nothing under the pinch');
      const mk = (type: string, id: number, x: number, y: number) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 });
      const at = (r: number) => [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }];
      let [a, b] = at(from);
      el.dispatchEvent(mk('pointerdown', 1, a!.x, a!.y));
      el.dispatchEvent(mk('pointerdown', 2, b!.x, b!.y));
      for (let i = 1; i <= steps; i++) {
        [a, b] = at(from + ((to - from) * i) / steps);
        el.dispatchEvent(mk('pointermove', 1, a!.x, a!.y));
        el.dispatchEvent(mk('pointermove', 2, b!.x, b!.y));
        await new Promise((r) => setTimeout(r, 16));
      }
      el.dispatchEvent(mk('pointerup', 1, a!.x, a!.y));
      el.dispatchEvent(mk('pointerup', 2, b!.x, b!.y));
    },
    { c: centre, from, to, steps },
  );
}

/** The page must not be scrolled, zoomed or wider than the screen: the shell stays put. */
export async function expectShellStill(page: Page): Promise<void> {
  const s = await page.evaluate(() => ({ x: scrollX, y: scrollY, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vvScale: visualViewport!.scale, vvTop: visualViewport!.offsetTop }));
  expect(s.x, 'window scrolled sideways').toBe(0);
  expect(s.y, 'window scrolled down').toBe(0);
  expect(s.sw, 'page wider than the screen').toBeLessThanOrEqual(s.cw + 1);
  expect(s.vvScale, 'page zoomed').toBe(1);
}

/** Every visible control inside `root` is fully on screen and big enough to tap (>= 40px, WCAG 2.5.8 floor is 24, the app aims for 44). */
export async function expectTappable(root: Locator, min = 40): Promise<void> {
  const bad = await root.evaluate((el, min) => {
    const out: string[] = [];
    for (const b of el.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"], input:not([type="hidden"]), select, textarea, summary')) {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || b.closest('[inert],[hidden]')) continue;
      const label = (b.getAttribute('aria-label') || b.textContent || b.tagName).trim().slice(0, 30);
      if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; // scrolled away inside a scroller: not on screen
      if ((r.width < min || r.height < min) && !(b as HTMLInputElement).type?.match(/checkbox|radio|range/)) out.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, min);
  expect(bad, `controls smaller than ${min}px`).toEqual([]);
}

/** Nothing the user can see overlaps the point where a control's centre is: another element would swallow the tap. */
export async function expectNotCovered(locator: Locator): Promise<void> {
  const covered = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && !(el === hit || el.contains(hit)) ? `${hit.tagName}.${hit.className}` : null;
  });
  expect(covered, 'another element covers the control').toBeNull();
}

/** Fails the test on page errors and on console errors except known noise. */
export function watchErrors(page: Page, testInfo: TestInfo): string[] {
  const errors: string[] = [];
  const ignore = /favicon|fonts\.g|preconnect|Failed to load resource.*(404|net::ERR)|vite|Download the React DevTools|ResizeObserver loop|translate-batch|api\/translate/i;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.test(m.text())) errors.push(m.text());
  });
  testInfo.attach('errors-collector', { body: 'attached' }).catch(() => undefined);
  return errors;
}

export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}
