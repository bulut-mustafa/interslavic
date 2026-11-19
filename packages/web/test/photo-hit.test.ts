import { describe, expect, it } from 'vitest';
import { newLayer } from '../src/editor/layers.ts';
import type { ImageLayer, PhotoLayer, ShapeLayer } from '../src/photo/doc.ts';
import { boundsOfSelection, boxOfLayer, hitPage, layersInRect } from '../src/photo/hit.ts';

const measure = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
const base = { opacity: 1, blend: 'normal' as const, rotation: 0 };
const shape = (id: string, over: Partial<ShapeLayer> = {}): ShapeLayer => ({ id, kind: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#f00', ...base, ...over });
const image = (id: string, over: Partial<ImageLayer> = {}): ImageLayer => ({ id, kind: 'image', src: 's', x: 0, y: 0, w: 100, h: 50, ...base, ...over });

describe('boxOfLayer', () => {
  it('gives centre, size and rotation for every kind', () => {
    expect(boxOfLayer(shape('a', { x: 10, y: 20, w: 40, h: 20, rotation: 30 }))).toEqual({ id: 'a', cx: 30, cy: 30, w: 40, h: 20, rotation: 30 });
    expect(boxOfLayer(image('i', { x: 0, y: 0, w: 10, h: 10 })).cx).toBe(5);
    const t = newLayer({ id: 't', x: 10, y: 10, text: 'abcd', rotation: 45 });
    const b = boxOfLayer(t, measure);
    expect(b.rotation).toBe(45);
    expect(b.cx).toBeGreaterThan(10);
  });
});

describe('hitPage', () => {
  it('takes the front-most layer and skips hidden and locked ones', () => {
    const ls: PhotoLayer[] = [shape('back'), shape('mid'), shape('front', { hidden: true }), shape('locked', { locked: true })];
    expect(hitPage(ls, 50, 25)).toBe('mid');
    expect(hitPage(ls, 500, 25)).toBeNull();
  });

  it('tests a rotated rectangle by its real corners', () => {
    const l = shape('r', { x: 0, y: 0, w: 100, h: 20, rotation: 90 });
    // turned upright about (50, 10): now spans x 40..60, y -40..60
    expect(hitPage([l], 50, 50, undefined, 0)).toBe('r');
    expect(hitPage([l], 10, 10, undefined, 0)).toBeNull();
  });

  it('hits text with a little slack', () => {
    const t = newLayer({ id: 't', x: 100, y: 100, text: 'abcd' });
    expect(hitPage([t], 98, 110, measure)).toBe('t');
    expect(hitPage([t], 60, 110, measure)).toBeNull();
  });

  it('hits an ellipse and a triangle by their shape, not their box', () => {
    const e = shape('e', { shape: 'ellipse' });
    expect(hitPage([e], 50, 25)).toBe('e');
    expect(hitPage([e], 2, 2, undefined, 0)).toBeNull();
    const tri = shape('tri', { shape: 'triangle' });
    expect(hitPage([tri], 50, 40)).toBe('tri');
    expect(hitPage([tri], 5, 5, undefined, 0)).toBeNull();
  });

  it('respects flips of a triangle', () => {
    const tri = shape('tri', { shape: 'triangle', flipY: true });
    expect(hitPage([tri], 50, 10)).toBe('tri'); // the wide side is now on top
    expect(hitPage([tri], 5, 45, undefined, 0)).toBeNull();
  });

  it('gives a thin line slack, but not a long way off', () => {
    const line = shape('ln', { shape: 'line', h: 0, w: 200, x: 0, y: 50, fill: undefined, stroke: { color: '#000', width: 2 } });
    expect(hitPage([line], 100, 54)).toBe('ln');
    expect(hitPage([line], 100, 80)).toBeNull();
    expect(hitPage([line], 250, 50)).toBeNull();
    const turned = { ...line, rotation: 90 };
    expect(hitPage([turned], 100, 5)).toBe('ln'); // vertical through x = 100
    expect(hitPage([turned], 20, 50)).toBeNull();
  });

  it('picks an unfilled shape by its outline only', () => {
    const r = shape('r', { fill: undefined, stroke: { color: '#000', width: 4 } });
    expect(hitPage([r], 50, 25)).toBeNull();
    expect(hitPage([r], 1, 25)).toBe('r');
  });

  it('a framed picture is hit inside its frame only', () => {
    const i = image('i', { frame: 'ellipse' });
    expect(hitPage([i], 50, 25)).toBe('i');
    expect(hitPage([i], 2, 2)).toBeNull();
    expect(hitPage([image('plain')], 2, 2)).toBe('plain');
  });
});

describe('layersInRect', () => {
  const ls: PhotoLayer[] = [shape('a', { x: 0, y: 0, w: 50, h: 50 }), shape('b', { x: 100, y: 0, w: 50, h: 50 }), shape('c', { x: 100, y: 0, w: 50, h: 50, locked: true }), shape('d', { x: 0, y: 0, w: 50, h: 50, hidden: true })];
  it('touch and contain', () => {
    expect(layersInRect(ls, { x: 40, y: 40, w: 80, h: 5 })).toEqual(['a', 'b']);
    expect(layersInRect(ls, { x: 40, y: 40, w: 80, h: 5 }, undefined, 'contain')).toEqual([]);
    expect(layersInRect(ls, { x: -5, y: -5, w: 60, h: 60 }, undefined, 'contain')).toEqual(['a']);
    expect(layersInRect(ls, { x: 300, y: 300, w: 10, h: 10 })).toEqual([]);
  });
  it('uses the turned box, not its unturned one', () => {
    // a thin bar turned to vertical: the marquee beside its unturned box but on its turned one
    const bar = shape('bar', { x: 0, y: 0, w: 100, h: 10, rotation: 90 }); // vertical, x 45..55, y -45..55
    expect(layersInRect([bar], { x: 46, y: 40, w: 4, h: 4 })).toEqual(['bar']);
    expect(layersInRect([bar], { x: 5, y: 2, w: 4, h: 4 })).toEqual([]);
  });
});

describe('boundsOfSelection', () => {
  it('unions the turned boxes', () => {
    const ls: PhotoLayer[] = [shape('a', { x: 0, y: 0, w: 100, h: 10, rotation: 90 }), shape('b', { x: 200, y: 100, w: 10, h: 10 })];
    const r = boundsOfSelection(ls, ['a', 'b'])!;
    expect(r.x).toBeCloseTo(45, 9);
    expect(r.y).toBeCloseTo(-45, 9);
    expect(r.x + r.w).toBeCloseTo(210, 9);
    expect(r.y + r.h).toBeCloseTo(110, 9);
    expect(boundsOfSelection(ls, ['zzz'])).toBeNull();
  });
});
