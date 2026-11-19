import { describe, expect, it, vi } from 'vitest';
import {
  applyAdjustPixels,
  applyMask,
  resetMaskPool,
  chromaKey,
  cssFilter,
  hueMatrix,
  isNeutralAdjust,
  maskPath,
  needsPixelPass,
  parseHex,
  type Mask,
} from '../src/video/effects.ts';

const px = (r: number, g: number, b: number, a = 255) => ({ data: new Uint8ClampedArray([r, g, b, a]), width: 1, height: 1 }) as unknown as ImageData;
const rgba = (img: ImageData) => Array.from(img.data);

describe('cssFilter', () => {
  it('is none for an untouched adjustment', () => {
    expect(cssFilter(undefined)).toBe('none');
    expect(cssFilter({ brightness: 0, blur: 0 })).toBe('none');
  });
  it('maps -100..100 to CSS multipliers, hue to degrees, blur to px, in a fixed order', () => {
    expect(cssFilter({ brightness: 20, contrast: -50, saturation: 100, hue: 90, blur: 3 })).toBe('brightness(1.2) contrast(0.5) saturate(2) hue-rotate(90deg) blur(3px)');
  });
  it('ignores the pixel-only extras', () => {
    expect(cssFilter({ sharpen: 50, vignette: 20, fade: 10, temperature: 5, tint: 5 })).toBe('none');
  });
});

describe('needsPixelPass', () => {
  it('needs the extras always, the basics only without ctx.filter', () => {
    expect(needsPixelPass({ brightness: 10 }, true)).toBe(false);
    expect(needsPixelPass({ brightness: 10 }, false)).toBe(true);
    expect(needsPixelPass({ vignette: 10 }, true)).toBe(true);
    expect(needsPixelPass({}, false)).toBe(false);
    expect(isNeutralAdjust({ blur: 0 })).toBe(true);
  });
});

describe('applyAdjustPixels: the CSS filter functions', () => {
  it('brightness is a linear multiplier (spec: slope = amount)', () => {
    const i = px(100, 200, 50);
    applyAdjustPixels(i, { brightness: 50 });
    expect(rgba(i)).toEqual([150, 255, 75, 255]);
  });
  it('contrast is slope a, intercept 0.5 - 0.5a (spec)', () => {
    const i = px(51, 128, 204);
    applyAdjustPixels(i, { contrast: 100 }); // a = 2
    // 2*0.2 - 0.5 = -0.1 -> 0 ; 2*128/255 - 0.5 = 0.504 -> 128 ; 2*0.8 - 0.5 = 1.1 -> 255
    expect(rgba(i)).toEqual([0, 128, 255, 255]);
    const j = px(51, 128, 204);
    applyAdjustPixels(j, { contrast: -100 }); // a = 0 -> everything 0.5
    expect(rgba(j)).toEqual([128, 128, 128, 255]);
  });
  it('saturate uses the spec matrix; 0 is luminance grey with the spec weights', () => {
    const i = px(255, 0, 0);
    applyAdjustPixels(i, { saturation: -100 });
    expect(rgba(i)).toEqual([54, 54, 54, 255]); // 0.213 * 255 = 54.3
    const j = px(200, 100, 50);
    applyAdjustPixels(j, { saturation: 0 });
    expect(rgba(j)).toEqual([200, 100, 50, 255]);
  });
  it('hue-rotate 0 is the identity and 180 gives the spec matrix values', () => {
    const m0 = hueMatrix(0);
    expect(m0[0]).toBeCloseTo(0.213 + 0.787, 10);
    expect(m0[4]).toBeCloseTo(0.715 + 0.285, 10);
    expect(m0[8]).toBeCloseTo(0.072 + 0.928, 10);
    const m = hueMatrix(180); // cos=-1, sin=0 (to float error)
    expect(m[0]).toBeCloseTo(0.213 - 0.787, 6);
    expect(m[1]).toBeCloseTo(0.715 + 0.715, 6);
    expect(m[2]).toBeCloseTo(0.072 + 0.072, 6);
    const i = px(255, 0, 0);
    applyAdjustPixels(i, { hue: 180 });
    // red in: r' = 0.213 - 0.787 = -0.574 (clamps to 0), g' = b' = 0.213 + 0.213 = 0.426 -> 108.6
    expect(rgba(i)).toEqual([0, 109, 109, 255]);
  });
  it('hue rows each sum to 1 for any angle (grey stays grey)', () => {
    for (const deg of [30, 77, 200]) {
      const m = hueMatrix(deg);
      for (const row of [0, 3, 6]) expect(m[row]! + m[row + 1]! + m[row + 2]!).toBeCloseTo(1, 2);
    }
  });
  it('keeps alpha and leaves a neutral adjustment untouched', () => {
    const i = px(10, 20, 30, 77);
    applyAdjustPixels(i, {});
    expect(rgba(i)).toEqual([10, 20, 30, 77]);
    applyAdjustPixels(i, { brightness: 10 });
    expect(i.data[3]).toBe(77);
  });
  it('extrasOnly skips the CSS-filter functions', () => {
    const i = px(100, 100, 100);
    applyAdjustPixels(i, { brightness: 50 }, { extrasOnly: true });
    expect(rgba(i)).toEqual([100, 100, 100, 255]);
  });
});

describe('applyAdjustPixels: extras', () => {
  it('temperature warms (more red, less blue) and cooling does the opposite', () => {
    const w = px(100, 100, 100);
    applyAdjustPixels(w, { temperature: 100 });
    expect(w.data[0]).toBeGreaterThan(100);
    expect(w.data[2]).toBeLessThan(100);
    expect(w.data[1]).toBe(100);
    const c = px(100, 100, 100);
    applyAdjustPixels(c, { temperature: -100 });
    expect(c.data[0]).toBeLessThan(100);
    expect(c.data[2]).toBeGreaterThan(100);
  });
  it('tint towards magenta lowers green', () => {
    const i = px(100, 100, 100);
    applyAdjustPixels(i, { tint: 100 });
    expect(i.data[1]).toBeLessThan(100);
    expect(i.data[0]).toBe(100);
  });
  it('fade lifts black to the lift level and keeps white', () => {
    const b = px(0, 0, 0);
    applyAdjustPixels(b, { fade: 100 });
    expect(b.data[0]).toBe(64); // 0.25 * 255 = 63.75
    const w = px(255, 255, 255);
    applyAdjustPixels(w, { fade: 100 });
    expect(w.data[0]).toBe(255);
  });
  it('sharpen at 100 is the classic 5-centre kernel; flat areas are unchanged', () => {
    // 3x3 image, centre 100, neighbours 80, corners 0
    const d = new Uint8ClampedArray(3 * 3 * 4);
    const set = (x: number, y: number, v: number) => d.set([v, v, v, 255], (y * 3 + x) * 4);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) set(x, y, 0);
    set(1, 1, 100);
    set(1, 0, 80);
    set(0, 1, 80);
    set(2, 1, 80);
    set(1, 2, 80);
    const img = { data: d, width: 3, height: 3 } as unknown as ImageData;
    applyAdjustPixels(img, { sharpen: 100 });
    expect(d[(1 * 3 + 1) * 4]).toBe(180); // 5*100 - 4*80 = 180
    const flat = { data: new Uint8ClampedArray(3 * 3 * 4).fill(90), width: 3, height: 3 } as unknown as ImageData;
    applyAdjustPixels(flat, { sharpen: 100 });
    expect(Array.from(flat.data).every((v) => v === 90)).toBe(true);
  });
  it('sharpen gives the same result when its reused buffer was last used by a larger image', () => {
    const make = (w: number, h: number) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) d.set([(i * 37) % 256, (i * 11) % 256, (i * 5) % 256, 255], i * 4);
      return { data: d, width: w, height: h } as unknown as ImageData;
    };
    const fresh = make(5, 4);
    applyAdjustPixels(fresh, { sharpen: 60 });
    applyAdjustPixels(make(20, 20), { sharpen: 60 }); // grows the kept buffer
    const again = make(5, 4);
    applyAdjustPixels(again, { sharpen: 60 });
    expect(Array.from(again.data)).toEqual(Array.from(fresh.data));
  });
  it('vignette leaves the centre and darkens the corners', () => {
    const w = 9;
    const img = { data: new Uint8ClampedArray(w * w * 4).fill(200), width: w, height: w } as unknown as ImageData;
    applyAdjustPixels(img, { vignette: 100 });
    expect(img.data[(4 * w + 4) * 4]).toBe(200);
    expect(img.data[0]).toBeLessThan(40);
  });
});

describe('parseHex', () => {
  it('reads #rrggbb and #rgb, and refuses anything else', () => {
    expect(parseHex('#00ff00')).toEqual([0, 255, 0]);
    expect(parseHex('#0f0')).toEqual([0, 255, 0]);
    expect(parseHex('green')).toBeNull();
    expect(parseHex('#12')).toBeNull();
  });
});

describe('chromaKey', () => {
  const green = { color: '#00ff00', similarity: 0.4, smoothness: 0.08 };
  it('removes the key colour and keeps far colours', () => {
    const g = px(0, 255, 0);
    chromaKey(g, green);
    expect(g.data[3]).toBe(0);
    const red = px(255, 0, 0);
    chromaKey(red, green);
    expect(red.data[3]).toBe(255);
    expect(rgba(red).slice(0, 3)).toEqual([255, 0, 0]);
  });
  it('ramps alpha as clamp((d - similarity)/smoothness)^1.5 on the UV chroma plane', () => {
    // white: UV (0.5,0.5); green key UV (0.169,0.081): d = hypot(0.331,0.419)
    const d = Math.hypot(0.331, 0.419);
    const white = px(255, 255, 255);
    chromaKey(white, { color: '#00ff00', similarity: d - 0.04, smoothness: 0.08 });
    expect(white.data[3]).toBe(Math.round(255 * 0.5 ** 1.5));
  });
  it('multiplies the existing alpha and works with zero smoothness as a hard step', () => {
    const g = px(10, 250, 10, 100);
    chromaKey(g, { color: '#00ff00', similarity: 0.3, smoothness: 0 });
    expect(g.data[3]).toBe(0);
    const r = px(255, 0, 0, 100);
    chromaKey(r, { color: '#00ff00', similarity: 0.3, smoothness: 0 });
    expect(r.data[3]).toBe(100);
  });
  it('does nothing for a colour it cannot read', () => {
    const g = px(0, 255, 0);
    chromaKey(g, { color: 'nope', similarity: 0.4, smoothness: 0.1 });
    expect(g.data[3]).toBe(255);
  });
});

/** A path that records its calls. */
function fakePath() {
  const calls: [string, ...number[]][] = [];
  const p: Record<string, unknown> = { calls };
  for (const n of ['moveTo', 'lineTo', 'bezierCurveTo', 'ellipse', 'rect', 'closePath']) p[n] = (...a: number[]) => calls.push([n, ...a]);
  return p as unknown as Path2D & { calls: typeof calls };
}
const mk = (over: Partial<Mask> = {}): Mask => ({ shape: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5, rotation: 0, feather: 0, invert: false, ...over });

describe('maskPath', () => {
  it('rect: four corners in the layer box in pixels', () => {
    const p = maskPath(mk(), 200, 100, fakePath) as ReturnType<typeof fakePath>;
    expect(p.calls).toEqual([['moveTo', 50, 25], ['lineTo', 150, 25], ['lineTo', 150, 75], ['lineTo', 50, 75], ['closePath']]);
  });
  it('rect rotated 90 degrees about its centre swaps its extents in pixels', () => {
    const p = maskPath(mk({ rotation: 90 }), 200, 100, fakePath) as ReturnType<typeof fakePath>;
    const [m] = p.calls;
    expect(m![0]).toBe('moveTo');
    expect(m![1]).toBeCloseTo(125, 6); // centre (100,50); corner (-50,-25) turned 90 deg clockwise -> (25,-50)
    expect(m![2]).toBeCloseTo(0, 6);
  });
  it('ellipse: centre, radii and rotation in radians', () => {
    const p = maskPath(mk({ shape: 'ellipse', rotation: 90 }), 200, 100, fakePath) as ReturnType<typeof fakePath>;
    expect(p.calls[0]).toEqual(['ellipse', 100, 50, 50, 25, Math.PI / 2, 0, 2 * Math.PI]);
  });
  it('heart: stays inside its own box and is left-right symmetric', () => {
    const p = maskPath(mk({ shape: 'heart', x: 0, y: 0, w: 1, h: 1 }), 100, 100, fakePath) as ReturnType<typeof fakePath>;
    const pts: number[][] = [];
    for (const [n, ...a] of p.calls) if (n === 'moveTo' || n === 'lineTo' || n === 'bezierCurveTo') for (let i = 0; i < a.length; i += 2) pts.push([a[i]!, a[i + 1]!]);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(100 + 1e-9);
      expect(pts.some(([a, b]) => Math.abs(a! - (100 - x!)) < 1e-6 && Math.abs(b! - y!) < 1e-6)).toBe(true);
    }
  });
  it('invert adds the whole box as a second sub-path', () => {
    const p = maskPath(mk({ invert: true }), 200, 100, fakePath) as ReturnType<typeof fakePath>;
    expect(p.calls[0]).toEqual(['rect', 0, 0, 200, 100]);
  });
});

/** A context that logs what happens to it. */
function fakeCtx(log: string[]) {
  return new Proxy(
    {},
    {
      get: (_t, k: string) => (...a: unknown[]) => log.push(`${k}${k === 'clip' ? `:${a[1] ?? 'nonzero'}` : ''}`),
      set: (_t, k: string, v) => (log.push(`${k}=${String(v)}`), true),
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe('applyMask', () => {
  it('without feather: save, clip, draw, restore', () => {
    const log: string[] = [];
    applyMask(fakeCtx(log), mk(), 200, 100, () => log.push('draw'), { makePath: fakePath });
    expect(log).toEqual(['save', 'clip:nonzero', 'draw', 'restore']);
  });
  it('inverted uses the even-odd rule', () => {
    const log: string[] = [];
    applyMask(fakeCtx(log), mk({ invert: true }), 200, 100, () => log.push('draw'), { makePath: fakePath });
    expect(log).toContain('clip:evenodd');
  });
  it('with feather: shadow-blurred shape on one scratch canvas, content kept with destination-in, then drawn once', () => {
    const logs = { mask: [] as string[], content: [] as string[], main: [] as string[] };
    const made: string[] = [];
    const scratch = (w: number, h: number) => {
      const kind = made.length === 0 ? 'mask' : 'content';
      made.push(kind);
      return { width: w, height: h, getContext: () => fakeCtx(logs[kind as 'mask' | 'content']) } as unknown as HTMLCanvasElement;
    };
    applyMask(fakeCtx(logs.main), mk({ feather: 10 }), 200, 100, () => logs.content.push('draw'), { makePath: fakePath, scratch });
    expect(logs.mask).toContain('shadowBlur=10');
    expect(logs.mask.some((l) => l.startsWith('shadowOffsetX='))).toBe(true);
    expect(logs.mask).toContain('fill');
    expect(logs.content).toEqual(['save', 'draw', 'globalCompositeOperation=destination-in', 'drawImage', 'restore']);
    expect(logs.main).toEqual(['drawImage']);
  });
  it('default scratch: two canvases made once, kept between frames, resized only when the size changes', () => {
    const made: { sets: string[]; clears: number }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const rec = { sets: [] as string[], clears: 0 };
        made.push(rec);
        let w = 0;
        let h = 0;
        return {
          get width() { return w; },
          set width(v: number) { rec.sets.push(`w${v}`); w = v; },
          get height() { return h; },
          set height(v: number) { rec.sets.push(`h${v}`); h = v; },
          getContext: () => new Proxy({}, { get: (_t, k: string) => (k === 'clearRect' ? () => rec.clears++ : () => {}), set: () => true }),
        };
      },
    });
    resetMaskPool();
    const run = (w: number, h: number) => applyMask(fakeCtx([]), mk({ feather: 4 }), w, h, () => {}, { makePath: fakePath });
    run(40, 20);
    run(40, 20);
    run(40, 20);
    expect(made).toHaveLength(2);
    expect(made[0]!.sets).toEqual(['w40', 'h20']);
    expect(made[1]!.sets).toEqual(['w40', 'h20']);
    expect(made[0]!.clears).toBe(2);
    run(50, 20);
    vi.unstubAllGlobals();
    expect(made).toHaveLength(2);
    expect(made[0]!.sets).toEqual(['w40', 'h20', 'w50', 'h20']);
  });
  it('feather + invert keeps the outside with destination-out', () => {
    const content: string[] = [];
    let n = 0;
    const scratch = (w: number, h: number) => ({ width: w, height: h, getContext: () => fakeCtx(n++ === 0 ? [] : content) }) as unknown as HTMLCanvasElement;
    applyMask(fakeCtx([]), mk({ feather: 4, invert: true }), 100, 100, () => {}, { makePath: fakePath, scratch });
    expect(content).toContain('globalCompositeOperation=destination-out');
  });
});
