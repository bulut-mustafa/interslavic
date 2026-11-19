import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../src/editor/text-style.ts';
import type { TextLayer } from '../src/editor/layers.ts';
import type { BaseEdit, ImageLayer, PhotoLayer, ShapeLayer } from '../src/photo/doc.ts';
import { applyAdjustPatch, clampDelta, geometryOf, inferHandle, isIdentityGeometry, mapText, movable, patchObjects, presetsFor, selectable, srcsOf, uprightOf, withGeometry, withoutColour, withoutCrop } from '../src/photo/page-ops.ts';
import { PRESETS } from '../src/photo/presets.ts';

const img = (id: string, src = 's', over: Partial<ImageLayer> = {}): ImageLayer => ({ id, kind: 'image', src, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...over });
const shp = (id: string, over: Partial<ShapeLayer> = {}): ShapeLayer => ({ id, kind: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...over });
const txt = (id: string, text = 'a'): TextLayer => ({ id, text, x: 0, y: 0, maxWidth: 0, style: { ...DEFAULT_STYLE } });
const box = (cx: number, cy: number, w: number, h: number, rotation = 0) => ({ id: 'b', cx, cy, w, h, rotation });

describe('withGeometry / geometryOf', () => {
  it('replaces the geometry, drops fields that are off (not 0/false/undefined), and keeps the colour edits', () => {
    const b: BaseEdit = { crop: { x: 1, y: 1, w: 5, h: 5 }, turns: 1, straighten: 3, flipX: true, flipY: true, preset: 'warm', presetAmount: 0.5, adjust: { brightness: 0.1 } as never, background: 'bg' };
    const out = withGeometry(b, { turns: 0, straighten: 0, flipX: false });
    expect(Object.keys(out).sort()).toEqual(['adjust', 'background', 'preset', 'presetAmount']);
    expect(out.preset).toBe('warm');
  });
  it('sets only the fields that are on, and round-trips through geometryOf', () => {
    const g = { crop: { x: 1, y: 2, w: 3, h: 4 }, turns: 3 as const, straighten: -5, flipY: true };
    const out = withGeometry({}, g);
    expect(out).toEqual({ ...g });
    expect('flipX' in out).toBe(false);
    expect(geometryOf(out)).toMatchObject(g);
  });
  it('isIdentityGeometry ignores colour, treats 0/false like missing, and sees any geometry field', () => {
    expect(isIdentityGeometry({ preset: 'x', turns: 0, flipX: false, straighten: 0 })).toBe(true);
    for (const b of [{ turns: 1 }, { flipX: true }, { flipY: true }, { straighten: 1 }, { crop: { x: 0, y: 0, w: 1, h: 1 } }] as BaseEdit[]) expect(isIdentityGeometry(b)).toBe(false);
  });
  it('withoutCrop and withoutColour remove exactly their fields', () => {
    expect(withoutCrop({ crop: { x: 0, y: 0, w: 1, h: 1 }, turns: 1 })).toEqual({ turns: 1 });
    expect(withoutColour({ adjust: {} as never, preset: 'a', presetAmount: 1, turns: 1, background: 'bg' })).toEqual({ turns: 1, background: 'bg' });
  });
});

describe('applyAdjustPatch', () => {
  it('an undefined preset removes the preset AND its amount; a new preset keeps the amount', () => {
    expect(applyAdjustPatch({ preset: 'a', presetAmount: 0.3 }, { preset: undefined })).toEqual({});
    expect(applyAdjustPatch({ preset: 'a', presetAmount: 0.3 }, { preset: 'b' })).toEqual({ preset: 'b', presetAmount: 0.3 });
  });
  it('sets the amount, ignores an undefined amount, replaces adjust, and never mutates the input', () => {
    const b: BaseEdit = { preset: 'a', presetAmount: 0.3 };
    expect(applyAdjustPatch(b, { presetAmount: 0.8 }).presetAmount).toBe(0.8);
    expect(applyAdjustPatch(b, { presetAmount: undefined }).presetAmount).toBe(0.3);
    expect(applyAdjustPatch(b, { adjust: { contrast: 0.2 } as never }).adjust).toEqual({ contrast: 0.2 });
    expect(applyAdjustPatch(b, { adjust: undefined })).toHaveProperty('adjust', undefined);
    expect(b).toEqual({ preset: 'a', presetAmount: 0.3 });
  });
});

describe('presetsFor', () => {
  it('answers null for an unknown name and an adjust for every listed one', () => {
    expect(presetsFor('nope', 1)).toBeNull();
    for (const p of PRESETS) expect(presetsFor(p.id, 1)).not.toBeNull();
  });
});

describe('layer selection helpers', () => {
  const layers: PhotoLayer[] = [img('a'), shp('b', { hidden: true }), img('c', 's', { locked: true }), txt('d'), shp('e')];
  it('movable: shown and unlocked among the asked ids only; selectable: all such', () => {
    expect(movable(layers, ['a', 'b', 'c', 'd', 'zzz'])).toEqual(['a', 'd']);
    expect(selectable(layers)).toEqual(['a', 'd', 'e']);
  });
  it('mapText changes text layers only, even when another kind has the id', () => {
    const out = mapText(layers, ['a', 'd'], (l) => ({ ...l, text: 'X' }));
    expect(out[0]).toBe(layers[0]);
    expect((out[3] as TextLayer).text).toBe('X');
    expect(out[4]).toBe(layers[4]);
  });
  it('patchObjects patches pictures and shapes only, removes keys set to undefined, leaves text and unchosen layers', () => {
    const src: PhotoLayer[] = [img('a', 's', { radius: 4 }), shp('b'), txt('t')];
    const out = patchObjects(src, ['a', 't'], { opacity: 0.5, radius: undefined, bogus: 1 });
    expect(out[0]).toMatchObject({ opacity: 0.5, bogus: 1 });
    expect('radius' in out[0]!).toBe(false);
    expect(out[1]).toBe(src[1]);
    expect(out[2]).toBe(src[2]);
    expect((src[0] as ImageLayer).radius).toBe(4);
  });
  it('srcsOf lists each picture file once, in order, and ignores shapes and text', () => {
    expect(srcsOf([img('a', 'x'), shp('b'), img('c', 'y'), img('d', 'x'), txt('t')])).toEqual(['x', 'y']);
  });
});

describe('inferHandle', () => {
  const b0 = box(50, 50, 40, 20); // l 30 r 70 t 40 b 60
  it('names the handle from the edges that moved, for all eight', () => {
    expect(inferHandle(b0, box(55, 50, 50, 20))).toBe('e'); // r +10
    expect(inferHandle(b0, box(45, 50, 50, 20))).toBe('w'); // l -10, r fixed
    expect(inferHandle(b0, box(50, 55, 40, 30))).toBe('s');
    expect(inferHandle(b0, box(50, 45, 40, 30))).toBe('n');
    expect(inferHandle(b0, box(55, 55, 50, 30))).toBe('se');
    expect(inferHandle(b0, box(45, 45, 50, 30))).toBe('nw');
    expect(inferHandle(b0, box(55, 45, 50, 30))).toBe('ne');
    expect(inferHandle(b0, box(45, 55, 50, 30))).toBe('sw');
  });
  it('shrinking works too (an edge moving inwards)', () => {
    expect(inferHandle(b0, box(45, 50, 30, 20))).toBe('e'); // r 70 -> 60
  });
  it('is null for a move, a centre resize, no change, and rotated boxes', () => {
    expect(inferHandle(b0, box(60, 50, 40, 20))).toBeNull();
    expect(inferHandle(b0, box(50, 50, 60, 20))).toBeNull();
    expect(inferHandle(b0, b0)).toBeNull();
    expect(inferHandle(box(50, 50, 40, 20, 30), box(55, 50, 50, 20, 30))).toBeNull();
    expect(inferHandle(b0, box(55, 50, 50, 20, 45))).toBeNull();
  });
  it('treats a full turn as upright', () => {
    expect(inferHandle(box(50, 50, 40, 20, 360), box(55, 50, 50, 20, 0))).toBe('e');
  });
});

describe('clampDelta', () => {
  const page = { w: 100, h: 100 };
  const r = { x: 40, y: 40, w: 20, h: 20 };
  it('lets a move that keeps the group on the page through unchanged', () => {
    expect(clampDelta(r, 10, -10, page)).toEqual({ dx: 10, dy: -10 });
  });
  it('stops a group leaving the page on each side, keeping `keep` (at most the group size) pixels visible', () => {
    expect(clampDelta(r, -500, 0, page)).toEqual({ dx: -40, dy: 0 }); // 20 px (its own width) stay: x ends at 0
    expect(clampDelta(r, 500, 0, page)).toEqual({ dx: 40, dy: 0 }); // x ends at 80
    expect(clampDelta(r, 0, -500, page)).toEqual({ dx: 0, dy: -40 });
    expect(clampDelta(r, 0, 500, page)).toEqual({ dx: 0, dy: 40 });
    const big = { x: 0, y: 0, w: 200, h: 200 };
    expect(clampDelta(big, -1000, 0, page, 24).dx).toBe(-176); // 24 px stay: x ends at -176
  });
  it('is not fooled by a group already off the page: it pulls it back', () => {
    expect(clampDelta({ x: -300, y: 0, w: 20, h: 20 }, 0, 0, page)).toEqual({ dx: 300, dy: 0 });
  });
});

describe('uprightOf', () => {
  it('is the box itself when upright and the bounding box when turned', () => {
    expect(uprightOf(box(50, 30, 40, 20))).toEqual({ x: 30, y: 20, w: 40, h: 20 });
    const q = uprightOf(box(50, 30, 40, 20, 90));
    expect(q.x).toBeCloseTo(40);
    expect(q.y).toBeCloseTo(10);
    expect(q.w).toBeCloseTo(20);
    expect(q.h).toBeCloseTo(40);
    const d = uprightOf(box(0, 0, 10, 10, 45));
    expect(d.w).toBeCloseTo(Math.SQRT2 * 10);
  });
});
