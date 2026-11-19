import { describe, expect, it, vi } from 'vitest';
import { newLayer } from '../src/editor/layers.ts';
import { drawFrame, fitRect, resetScratch, supportsFilter } from '../src/video/compositor.ts';
import type { MediaFeed } from '../src/video/contracts.ts';
import { emptyProject, type MediaLayer, type VideoProject } from '../src/video/project.ts';

/** A context that writes down every call and every property set, and measures text as 10 px a letter. */
function recorder(filter = true) {
  const log: string[] = [];
  const props: Record<string, unknown> = { filter: 'none' };
  const target: Record<string, unknown> = { measureText: (s: string) => ({ width: s.length * 10 }) };
  const ctx = new Proxy(target, {
    has: (t, k: string) => k in t || (k === 'filter' && filter),
    get: (t, k: string) => (k in t ? t[k] : k in props ? props[k] : (...a: unknown[]) => void log.push(`${k}(${a.map((x) => (typeof x === 'object' ? 'img' : x)).join(',')})`)),
    set: (_t, k: string, v) => {
      if (k === 'filter' && !filter) return true; // ignored, as a browser without it does
      props[k] = v;
      log.push(`${k}=${v}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const img = (name: string, w = 100, h = 50) => ({ name, width: w, height: h }) as unknown as CanvasImageSource;
const feed = (pics: Record<string, CanvasImageSource>): MediaFeed => ({ picture: (id) => pics[id] ?? null });
const media = (over: Partial<MediaLayer>): MediaLayer => ({ id: 'm', kind: 'media', srcId: 's', in: 0, start: 0, end: 10, track: 1, x: 0, y: 0, w: 100, h: 50, rotation: 0, opacity: 1, blend: 'normal', ...over });
const proj = (over: Partial<VideoProject> = {}): VideoProject => ({ ...emptyProject(), background: '#112233', clips: [{ id: 'c1', start: 0, end: 10, srcId: 's' }], ...over });
const size = { w: 200, h: 100 };
const draws = (log: string[]) => log.filter((l) => l.startsWith('drawImage')).length;

describe('fitRect', () => {
  it('contains with bars, or covers', () => {
    expect(fitRect({ w: 100, h: 100 }, { w: 200, h: 100 }, 'contain')).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(fitRect({ w: 100, h: 100 }, { w: 200, h: 100 }, 'cover')).toEqual({ x: 0, y: -50, w: 200, h: 200 });
  });
});

describe('drawFrame', () => {
  it('clears, fills the background, then draws the main clip with its opacity', () => {
    const { ctx, log } = recorder();
    drawFrame(ctx, { project: proj({ clips: [{ id: 'c1', start: 0, end: 10, srcId: 's', opacity: 0.5 }] }), time: 1, size, media: feed({ c1: img('v', 200, 100) }) });
    expect(log.slice(0, 4)).toEqual(['clearRect(0,0,200,100)', 'fillStyle=#112233', 'fillRect(0,0,200,100)', 'save()']);
    expect(log).toContain('globalAlpha=0.5');
    expect(log).toContain('drawImage(img,0,0,200,100)');
  });

  it('skips pictures that are not ready without throwing', () => {
    const { ctx, log } = recorder();
    drawFrame(ctx, { project: proj({ layers: [media({})] }), time: 1, size, media: feed({}) });
    expect(draws(log)).toBe(0);
  });

  it('draws layers by lane, then list order, and only inside [start,end)', () => {
    const { ctx, log } = recorder();
    const layers = [media({ id: 'top', track: 2 }), media({ id: 'low', track: 1 }), media({ id: 'late', track: 1, start: 5, end: 6 }), media({ id: 'gone', track: 0, start: 0, end: 2 })];
    const pics = { c1: img('main'), top: img('top'), low: img('low'), late: img('late'), gone: img('gone') };
    const order: string[] = [];
    const ctxd = ctx as unknown as { drawImage: (i: { name: string }) => void };
    const wrapped = new Proxy(ctxd, { get: (t, k: string) => (k === 'drawImage' ? (i: { name: string }) => order.push(i.name) : (t as any)[k]), set: (t, k: string, v) => ((t as any)[k] = v) });
    drawFrame(wrapped as unknown as CanvasRenderingContext2D, { project: proj({ layers }), time: 3, size, media: feed(pics) });
    expect(order).toEqual(['main', 'low', 'top']);
    expect(log.length).toBeGreaterThan(0);
  });

  it('rotates about the centre and sets alpha and blend for a media layer', () => {
    const { ctx, log } = recorder();
    drawFrame(ctx, { project: proj({ clips: [], layers: [media({ x: 10, y: 20, w: 40, h: 20, rotation: 90, opacity: 0.4, blend: 'multiply' })] }), time: 1, size, media: feed({ m: img('p') }) });
    const i = log.indexOf('translate(30,30)');
    expect(i).toBeGreaterThan(0);
    expect(log[i + 1]).toBe(`rotate(${Math.PI / 2})`);
    expect(log).toContain('globalAlpha=0.4');
    expect(log).toContain('globalCompositeOperation=multiply');
    expect(log).toContain('drawImage(img,0,0,40,20)');
    expect(log.indexOf('drawImage(img,0,0,40,20)')).toBeLessThan(log.lastIndexOf('restore()'));
  });

  it('applies adjustments through filter only when the context supports it', () => {
    const adjust = { brightness: 50, blur: 3 };
    const on = recorder(true);
    drawFrame(on.ctx, { project: proj({ clips: [], layers: [media({ adjust })] }), time: 1, size, media: feed({ m: img('p') }) });
    expect(on.log).toContain('filter=brightness(1.5) blur(3px)');
    // Without ctx.filter the adjustments are done per pixel on a scratch canvas, then that canvas is drawn.
    const scratchLog: string[] = [];
    const fakeCtx = { drawImage: () => scratchLog.push('scratch.drawImage'), getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h }), putImageData: () => scratchLog.push('scratch.put'), clearRect: () => scratchLog.push('scratch.clear') };
    resetScratch();
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx }) });
    const off = recorder(false);
    drawFrame(off.ctx, { project: proj({ clips: [], layers: [media({ adjust })] }), time: 1, size, media: feed({ m: img('p') }) });
    vi.unstubAllGlobals();
    expect(off.log.some((l) => l.startsWith('filter=brightness'))).toBe(false);
    expect(scratchLog).toContain('scratch.put');
    expect(draws(off.log)).toBe(1);
  });

  it('keeps the pixel-pass scratch canvas between frames: resized only when the size changes, cleared in place otherwise', () => {
    const sets: string[] = [];
    const log: string[] = [];
    const fakeCtx = { drawImage: () => {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: () => {}, clearRect: () => log.push('clear') };
    let w = 0;
    let h = 0;
    const canvas = {
      get width() { return w; },
      set width(v: number) { sets.push(`w${v}`); w = v; },
      get height() { return h; },
      set height(v: number) { sets.push(`h${v}`); h = v; },
      getContext: () => fakeCtx,
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    resetScratch();
    const adjust = { brightness: 50 };
    const run = (l: Partial<MediaLayer>) => drawFrame(recorder(false).ctx, { project: proj({ clips: [], layers: [media({ adjust, ...l })] }), time: 1, size, media: feed({ m: img('p') }) });
    run({});
    run({});
    run({});
    expect(sets).toEqual(['w100', 'h50']);
    expect(log).toEqual(['clear', 'clear']);
    run({ w: 60, h: 30 });
    vi.unstubAllGlobals();
    expect(sets).toEqual(['w100', 'h50', 'w60', 'h30']);
  });

  it('draws text unrotated exactly as the editor does, and rotated about its centre', () => {
    const t = newLayer({ id: 't', x: 10, y: 10, text: 'abcd', start: 0, end: 5 });
    const plain = recorder();
    drawFrame(plain.ctx, { project: proj({ clips: [], layers: [t] }), time: 1, size, media: feed({}) });
    expect(plain.log.some((l) => l.startsWith('fillText(abcd,'))).toBe(true);
    expect(plain.log.some((l) => l.startsWith('rotate('))).toBe(false);
    const rot = recorder();
    drawFrame(rot.ctx, { project: proj({ clips: [], layers: [{ ...t, rotation: 45 }] }), time: 1, size, media: feed({}) });
    expect(rot.log.some((l) => l.startsWith('rotate('))).toBe(true);
    const none = recorder();
    drawFrame(none.ctx, { project: proj({ clips: [], layers: [t] }), time: 9, size, media: feed({}) });
    expect(none.log.some((l) => l.startsWith('fillText'))).toBe(false);
  });

  it('outlines selected layers last', () => {
    const { ctx, log } = recorder();
    drawFrame(ctx, { project: proj({ clips: [], layers: [media({})] }), time: 1, size, media: feed({ m: img('p') }), selected: ['m'] });
    const last = log.map((l, i) => (l.startsWith('strokeRect') ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(last).toBeGreaterThan(log.indexOf('drawImage(img,0,0,100,50)'));
  });
});

describe('supportsFilter', () => {
  it('detects a context that ignores filter', () => {
    expect(supportsFilter(recorder(true).ctx)).toBe(true);
    expect(supportsFilter(recorder(false).ctx)).toBe(false);
  });
});
