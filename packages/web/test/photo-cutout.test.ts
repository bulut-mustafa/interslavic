import { describe, expect, it } from 'vitest';
import {
  applyMatte, boundingBox, coverage, cropRgba, decontaminate, featherMatte, finishCutout, fitInside, growMatte, levelsMatte,
  matteFromAlpha, newMatte, padBox, paintStroke, readableError, resizeMatte, CUTOUT_MODELS, type Matte, type Rgba,
} from '../src/photo/cutout.ts';

const matte = (w: number, h: number, v: number[]): Matte => ({ w, h, data: Uint8ClampedArray.from(v) });
const solid = (w: number, h: number, c: [number, number, number, number]): Rgba => ({
  w, h, data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => c[i % 4]!),
});

describe('matte basics', () => {
  it('reads the matte from the alpha of a model answer', () => {
    const r: Rgba = { w: 2, h: 1, data: Uint8ClampedArray.from([9, 9, 9, 10, 9, 9, 9, 200]) };
    expect([...matteFromAlpha(r).data]).toEqual([10, 200]);
  });

  it('keeps the size and values when resized to the same size, and copies', () => {
    const m = matte(2, 2, [0, 50, 100, 255]);
    const r = resizeMatte(m, 2, 2);
    expect([...r.data]).toEqual([0, 50, 100, 255]);
    expect(r.data).not.toBe(m.data);
  });

  it('upscales smoothly, keeping the ends and a value between them in the middle', () => {
    const r = resizeMatte(matte(2, 1, [0, 255]), 4, 1);
    // Pixel centres of a 4-wide row sit at 0.25, 0.75, 1.25, 1.75 of the source's 0.5 / 1.5 centres: 0, 63.75, 191.25, 255.
    expect([...r.data]).toEqual([0, 64, 191, 255]);
  });

  it('downscales a flat matte to the same flat value', () => {
    const r = resizeMatte(newMatte(9, 7, 120), 3, 2);
    expect(new Set(r.data)).toEqual(new Set([120]));
  });

  it('upscales in both directions', () => {
    const r = resizeMatte(matte(2, 2, [0, 0, 255, 255]), 2, 4);
    expect([...r.data]).toEqual([0, 0, 64, 64, 191, 191, 255, 255]);
  });
});

describe('applying a matte', () => {
  it('writes the matte into alpha and leaves the colours, without changing the input', () => {
    const pic = solid(2, 1, [10, 20, 30, 255]);
    const out = applyMatte(pic, matte(2, 1, [0, 128]));
    expect([...out.data]).toEqual([10, 20, 30, 0, 10, 20, 30, 128]);
    expect(pic.data[3]).toBe(255);
  });
  it('multiplies with the alpha already there', () => {
    const out = applyMatte(solid(1, 1, [1, 2, 3, 128]), matte(1, 1, [128]));
    expect(out.data[3]).toBe(64);
  });
  it('refuses a matte of another size', () => {
    expect(() => applyMatte(solid(2, 2, [0, 0, 0, 255]), newMatte(1, 1))).toThrow(/matte is 1x1/);
  });
});

describe('edge refinement', () => {
  it('levels: below low is gone, above high is solid, the middle is a smooth step', () => {
    const o = levelsMatte(matte(5, 1, [0, 20, 100, 180, 255]), 40, 200);
    expect(o.data[0]).toBe(0);
    expect(o.data[1]).toBe(0);
    expect(o.data[4]).toBe(255);
    expect(o.data[2]).toBeGreaterThan(0);
    expect(o.data[2]).toBeLessThan(o.data[3]!);
    expect(() => levelsMatte(newMatte(1, 1), 5, 5)).toThrow();
  });

  it('feather leaves a flat matte flat, and spreads a single dot without making or losing much', () => {
    expect(new Set(featherMatte(newMatte(6, 6, 200), 2).data)).toEqual(new Set([200]));
    const dot = newMatte(9, 9);
    dot.data[4 * 9 + 4] = 255;
    const f = featherMatte(dot, 1);
    expect(f.data[4 * 9 + 4]).toBeLessThan(255);
    expect(f.data[4 * 9 + 3]).toBeGreaterThan(0);
    expect(f.data[0]).toBe(0);
    const sum = (m: Matte) => m.data.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum(f) - 255)).toBeLessThan(255 * 0.02 * 9);
    expect([...featherMatte(dot, 0).data]).toEqual([...dot.data]);
  });

  it('grows and shrinks the subject by whole pixels', () => {
    const m = newMatte(7, 7);
    m.data[3 * 7 + 3] = 255;
    const grown = growMatte(m, 1);
    expect(grown.data.filter((v) => v === 255).length).toBe(9);
    expect(growMatte(grown, -1).data.filter((v) => v === 255).length).toBe(1);
    expect(growMatte(m, -1).data.filter((v) => v > 0).length).toBe(0);
  });

  it('replaces the rim colour with the nearby solid colour, only on partly transparent pixels', () => {
    const pic: Rgba = { w: 3, h: 1, data: Uint8ClampedArray.from([200, 0, 0, 255, 0, 0, 255, 255, 50, 50, 50, 255]) };
    // pixel 0 solid red-ish subject, pixel 1 a blue rim pixel at half alpha, pixel 2 background
    const out = decontaminate(pic, matte(3, 1, [255, 128, 0]), 1);
    expect([...out.data.slice(4, 7)]).toEqual([200, 0, 0]);
    expect([...out.data.slice(0, 4)]).toEqual([200, 0, 0, 255]);
    expect([...out.data.slice(8, 11)]).toEqual([50, 50, 50]);
  });

  it('leaves a rim pixel alone when no solid pixel is near', () => {
    const pic = solid(3, 1, [9, 8, 7, 255]);
    expect([...decontaminate(pic, matte(3, 1, [0, 100, 0]), 1).data]).toEqual([...pic.data]);
  });
});

describe('bounding box and trimming', () => {
  it('finds the box of what is above the floor, and null for nothing', () => {
    const m = newMatte(6, 5);
    m.data[1 * 6 + 2] = 200;
    m.data[3 * 6 + 4] = 255;
    m.data[0] = 5; // under the floor: noise
    expect(boundingBox(m)).toEqual({ x: 2, y: 1, w: 3, h: 3 });
    expect(boundingBox(newMatte(3, 3))).toBeNull();
  });
  it('pads inside the picture only', () => {
    expect(padBox({ x: 1, y: 1, w: 2, h: 2 }, 5, 10, 8)).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  });
  it('crops colours row by row', () => {
    const pic: Rgba = { w: 3, h: 2, data: Uint8ClampedArray.from({ length: 24 }, (_, i) => i) };
    expect([...cropRgba(pic, { x: 1, y: 1, w: 2, h: 1 }).data]).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
  });
  it('finishes: trims to the subject and says where it sits', () => {
    const m = newMatte(6, 6);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) m.data[y! * 6 + x!] = 255;
    const f = finishCutout(solid(6, 6, [5, 5, 5, 255]), m, { trim: true, pad: 1 });
    expect(f.box).toEqual({ x: 1, y: 1, w: 4, h: 4 });
    expect(f.rgba.w).toBe(4);
    expect(f.rgba.data[(1 * 4 + 1) * 4 + 3]).toBe(255);
    expect(f.rgba.data[3]).toBe(0);
  });
  it('keeps the whole picture when not trimming or when nothing was found', () => {
    expect(finishCutout(solid(4, 3, [0, 0, 0, 255]), newMatte(4, 3)).box).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(finishCutout(solid(4, 3, [0, 0, 0, 255]), newMatte(4, 3), { trim: true }).rgba.w).toBe(4);
  });
  it('reports how much the matte keeps', () => {
    expect(coverage(newMatte(2, 2, 255))).toBe(1);
    expect(coverage(matte(2, 1, [0, 255]))).toBe(0.5);
  });
});

describe('the refine brush', () => {
  it('erases a round patch and leaves the rest', () => {
    const m = newMatte(21, 21, 255);
    paintStroke(m, { points: [{ x: 10, y: 10 }], radius: 3, mode: 'erase' });
    expect(m.data[10 * 21 + 10]).toBe(0);
    expect(m.data[10 * 21 + 11]).toBe(0);
    expect(m.data[10 * 21 + 18]).toBe(255);
    expect(m.data[0]).toBe(255);
  });
  it('adds subject back, and a stroke leaves no gaps between its points', () => {
    const m = newMatte(40, 9);
    paintStroke(m, { points: [{ x: 4, y: 4 }, { x: 35, y: 4 }], radius: 2, mode: 'add' });
    for (let x = 4; x <= 35; x++) expect(m.data[4 * 40 + x]).toBe(255);
    expect(m.data[0]).toBe(0);
    expect(m.data[8 * 40 + 20]).toBe(0);
  });
  it('replays on a bigger matte through the scale', () => {
    const big = newMatte(40, 40, 255);
    paintStroke(big, { points: [{ x: 10, y: 10 }], radius: 3, mode: 'erase' }, 2);
    expect(big.data[20 * 40 + 20]).toBe(0);
    expect(big.data[20 * 40 + 25]).toBeLessThan(10);
    expect(big.data[20 * 40 + 30]).toBe(255);
  });
  it('stays inside the matte when the brush is at the edge', () => {
    const m = newMatte(5, 5, 255);
    expect(() => paintStroke(m, { points: [{ x: -2, y: 2 }, { x: 9, y: 9 }], radius: 4, mode: 'erase' })).not.toThrow();
  });
});

describe('sizes, models and messages', () => {
  it('shrinks to fit but never enlarges', () => {
    expect(fitInside(4000, 3000, 1000)).toEqual({ w: 1000, h: 750 });
    expect(fitInside(300, 200, 1000)).toEqual({ w: 300, h: 200 });
    expect(fitInside(1, 5000, 1000)).toEqual({ w: 1, h: 1000 });
  });
  it('lists only permissively licensed models', () => {
    for (const m of CUTOUT_MODELS) expect(m.license).toMatch(/^(Apache-2\.0|MIT)$/);
    expect(CUTOUT_MODELS[0]!.downloadMb).toBeLessThan(10);
  });
  it('turns failures into plain sentences', () => {
    expect(readableError(new TypeError('Failed to fetch'))).toMatch(/could not be downloaded/);
    expect(readableError(new Error('std::bad_alloc'))).toMatch(/ran out of memory/);
    expect(readableError(new Error('weird'))).toBe('The background could not be removed: weird');
  });
});
