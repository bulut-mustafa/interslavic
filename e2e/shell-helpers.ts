import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectShellStill, expectTappable, fixture } from './helpers';

export const WIDTHS = [320, 360, 390, 430] as const;

/**
 * The translator API with the REAL response shape (fixtures/translate-*.json were taken from the live site for
 * "Good morning, my friend", lang en). Requests are logged; `fail` makes the network fail, `status` makes it answer an error.
 */
export async function mockTranslate(page: Page, opts: { fail?: boolean; status?: number; delayMs?: number } = {}): Promise<{ calls: { text: string; lang: string; orthography: string; alternate?: string }[] }> {
  const log = { calls: [] as { text: string; lang: string; orthography: string; alternate?: string }[] };
  const std = readFileSync(fixture('translate-standard.json'), 'utf8');
  const cyr = readFileSync(fixture('translate-cyrillic.json'), 'utf8');
  await page.route('**/api/translate', async (route) => {
    const body = route.request().postDataJSON() as { text: string; lang: string; orthography: string; alternate?: string };
    log.calls.push(body);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail) return route.abort('failed');
    if (opts.status) return route.fulfill({ status: opts.status, json: { error: 'boom' } });
    // One request carries both scripts: `orthography` and `alternate`.
    const of = (o?: string) => (JSON.parse(o === 'cyrillic' ? cyr : std) as { sentences: unknown[] }).sentences;
    await route.fulfill({ status: 200, json: { sentences: of(body.orthography), ...(body.alternate ? { alternate: of(body.alternate) } : {}) } });
  });
  return log;
}

/** Blocks the library/speech noise nobody tests here; clipboard is granted where the browser allows it. */
export async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
}

/** Facts about the current page that must hold on every route on a phone. */
export async function pageFacts(page: Page) {
  return page.evaluate(() => {
    const iw = innerWidth;
    const de = document.documentElement;
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (p.matches('.ph-content, .ph-app')) return false; // the page's own scroller is the boundary: wide content in it IS the bug
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true;
      }
      return false;
    };
    const off: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.left < -1 || r.right > iw + 1) && !clipped(el)) off.push(`${el.tagName}.${String(el.className).slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      if (/^(hidden|checkbox|radio|range|file|color)$/.test(el.type)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) small.push(`${el.tagName}[${el.getAttribute('aria-label') ?? el.type}] ${fs}px`);
    }
    const pc = document.querySelector<HTMLElement>('.ph-content');
    if (pc && pc.scrollWidth > pc.clientWidth + 1) off.push(`.ph-content scrolls sideways ${pc.scrollWidth}>${pc.clientWidth}`);
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, bodyScrollW: document.body.scrollWidth, off: off.slice(0, 6), small, phone: !!document.querySelector('.ph-app') };
  });
}

/** The checks every phone route must pass at the current viewport. */
export async function expectHealthyPhonePage(page: Page, label: string): Promise<void> {
  const f = await pageFacts(page);
  expect(f.phone, `${label}: phone shell present`).toBe(true);
  expect(f.scrollW, `${label}: page scrolls sideways`).toBeLessThanOrEqual(f.clientW + 1);
  expect(f.bodyScrollW, `${label}: body scrolls sideways`).toBeLessThanOrEqual(f.clientW + 1);
  expect(f.off, `${label}: elements off screen`).toEqual([]);
  expect(f.small, `${label}: inputs under 16px zoom iOS`).toEqual([]);
  await expectShellStill(page);
  if (await page.locator('.ph-tabbar').count()) {
    await expect(page.locator('.ph-tabbar')).toBeVisible();
    await expectTappable(page.locator('.ph-tabbar'));
  }
  await expectTappable(page.locator('.ph-app > .ph-topbar'));
}


/** Drags an element vertically with touch pointer events that all go to that element (what pointer capture does on a real touch). */
export async function dragElement(page: Page, selector: string, dy: number, steps = 12): Promise<void> {
  await page.evaluate(
    async ({ selector, dy, steps }) => {
      const el = document.querySelector(selector)!;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y0 = r.top + r.height / 2;
      const mk = (type: string, y: number) => new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 });
      el.dispatchEvent(mk('pointerdown', y0));
      for (let i = 1; i <= steps; i++) {
        el.dispatchEvent(mk('pointermove', y0 + (dy * i) / steps));
        await new Promise((res) => setTimeout(res, 16));
      }
      el.dispatchEvent(mk('pointerup', y0 + dy));
    },
    { selector, dy, steps },
  );
}

/** A browser with a Czech reference voice, so the "Speak"/"Listen" buttons exist; speak() calls are recorded in window.__spoken. Without it headless browsers have no voice and the app (rightly) shows no button. */
export async function fakeVoices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voice = { voiceURI: 'fake-cs', name: 'Fake Czech', lang: 'cs-CZ', localService: true, default: true };
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    const define = (name: string, value: unknown) => Object.defineProperty(window, name, { value, configurable: true, writable: true });
    define('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
      this.text = text;
    });
    define('speechSynthesis', {
      getVoices: () => [voice],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      cancel: () => undefined,
      speak: (u: { text: string }) => void w.__spoken.push(u.text),
    });
  });
}
