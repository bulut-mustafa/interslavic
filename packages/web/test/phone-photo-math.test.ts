import { describe, expect, it } from 'vitest';
import { clampPan, fitScale, placement, revealPan, toPage, toStageRect, zoomAbout, MAX_ZOOM } from '../src/phone/photo/canvas-view.ts';
import { pinchLayer, planMove, softRotation } from '../src/phone/photo/gesture-actions.ts';
import { newLayer } from '../src/editor/layers.ts';
import type { ImageLayer, PhotoLayer, ShapeLayer } from '../src/photo/doc.ts';
import { boundsOfSelection } from '../src/photo/hit.ts';

const stage = { w: 400, h: 600 };
const page = { w: 1000, h: 500 };

describe('canvas-view', () => {
  it('fits the whole page with a margin and centres it', () => {
    expect(fitScale(stage, page)).toBeCloseTo((400 - 24) / 1000);
    const at = placement(stage, page, 1, { x: 0, y: 0 });
    expect(at.width).toBeCloseTo(376);
    expect(at.left).toBeCloseTo(12);
    expect(at.top).toBeCloseTo((600 - 188) / 2);
  });

  it('converts stage points to page points and back', () => {
    const at = placement(stage, page, 2, { x: 30, y: -20 });
    const g = toPage({ x: at.left + 100 * at.k, y: at.top + 50 * at.k }, at);
    expect(g.x).toBeCloseTo(100);
    expect(g.y).toBeCloseTo(50);
    const r = toStageRect({ x: 10, y: 20, w: 30, h: 40 }, at);
    expect(r.x).toBeCloseTo(at.left + 10 * at.k);
    expect(r.height).toBeCloseTo(40 * at.k);
  });

  it('allows no pan while the picture fits and limits it once zoomed', () => {
    expect(clampPan(stage, { w: 300, h: 200 }, { x: 80, y: 80 })).toEqual({ x: 0, y: 0 });
    const p = clampPan(stage, { w: 1000, h: 400 }, { x: 5000, y: 5000 });
    expect(p.x).toBeCloseTo((1000 - 400) / 2 + 48);
    expect(p.y).toBe(0);
  });

  it('a pinch zooms about the fingers: the page point under them stays put', () => {
    const tall = { w: 1000, h: 1500 };
    const focus = { x: 300, y: 250 };
    const before = placement(stage, tall, 1, { x: 0, y: 0 });
    const under = toPage(focus, before);
    const z = zoomAbout(stage, tall, 1, { x: 0, y: 0 }, 2, focus, { x: 0, y: 0 });
    expect(z.zoom).toBe(2);
    const after = placement(stage, tall, z.zoom, z.pan);
    const now = toPage(focus, after);
    expect(now.x).toBeCloseTo(under.x, 0);
    expect(now.y).toBeCloseTo(under.y, 0);
  });

  it('keeps the zoom between 1 and the maximum, and the midpoint travel pans', () => {
    expect(zoomAbout(stage, page, 1, { x: 0, y: 0 }, 0.3, { x: 200, y: 300 }, { x: 0, y: 0 }).zoom).toBe(1);
    expect(zoomAbout(stage, page, 4, { x: 0, y: 0 }, 9, { x: 200, y: 300 }, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    const panned = zoomAbout(stage, page, 3, { x: 0, y: 0 }, 1, { x: 200, y: 300 }, { x: -40, y: 0 });
    expect(panned.pan.x).toBeCloseTo(-40);
  });

  it('reveals a box that a keyboard covers, without pushing its top out of view', () => {
    const shortStage = { w: 400, h: 200 };
    const moved = revealPan(shortStage, { x: 50, y: 170, width: 100, height: 20 }, { x: 0, y: 0 });
    expect(moved.y).toBeLessThan(0);
    expect(170 + moved.y + 20).toBeLessThanOrEqual(200 - 16 + 0.001);
    const tall = revealPan(shortStage, { x: 50, y: 40, width: 100, height: 400 }, { x: 0, y: 0 });
    expect(40 + tall.y).toBeCloseTo(16);
  });
});

const shape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({ kind: 'shape', id: 's1', shape: 'rect', x: 100, y: 100, w: 200, h: 100, rotation: 0, opacity: 1, blend: 'normal', fill: '#000', ...over });
const picture = (over: Partial<ImageLayer> = {}): ImageLayer => ({ kind: 'image', id: 'p1', src: 'f1', x: 0, y: 0, w: 200, h: 100, rotation: 10, opacity: 1, blend: 'normal', ...over });
const measure = (l: { text: string; style: { size: number } }) => ({ w: l.text.length * l.style.size * 0.5, h: l.style.size * 1.2 });

describe('gesture actions', () => {
  it('a drag moves the layers by the finger travel in page px, snapping to the page centre', () => {
    const base: PhotoLayer[] = [shape(), shape({ id: 's2', x: 700, y: 10 })];
    const rect = boundsOfSelection(base, ['s1'])!;
    const out = planMove({ base, ids: ['s1'], rect, others: [], dx: 30, dy: 20, page: { w: 1000, h: 800 }, k: 1, snap: false });
    expect((out.layers[0] as ShapeLayer).x).toBe(130);
    expect((out.layers[0] as ShapeLayer).y).toBe(120);
    expect((out.layers[1] as ShapeLayer).x).toBe(700); // the others stay
    // Near the centre line it snaps onto it and says so.
    const snapped = planMove({ base, ids: ['s1'], rect, others: [], dx: 297, dy: 0, page: { w: 1000, h: 800 }, k: 1 });
    expect((snapped.layers[0] as ShapeLayer).x + 100).toBeCloseTo(500);
    expect(snapped.guides.length).toBeGreaterThan(0);
  });

  it('a drag keeps part of the layer on the page', () => {
    const base: PhotoLayer[] = [shape()];
    const rect = boundsOfSelection(base, ['s1'])!;
    const out = planMove({ base, ids: ['s1'], rect, others: [], dx: 5000, dy: 0, page: { w: 1000, h: 800 }, k: 1, snap: false });
    expect((out.layers[0] as ShapeLayer).x).toBeLessThan(1000);
  });

  it('a pinch scales a picture about its centre, keeps its ratio, turns it and moves it with the fingers', () => {
    const next = pinchLayer(picture(), { scale: 2, rotation: 30, dx: 10, dy: -5 }, measure as never, { w: 1000, h: 800 }) as ImageLayer;
    expect(next.w).toBe(400);
    expect(next.h).toBe(200);
    expect(next.rotation).toBe(40);
    expect(next.x + next.w / 2).toBeCloseTo(110);
    expect(next.y + next.h / 2).toBeCloseTo(45);
  });

  it('a pinch never makes a picture vanish', () => {
    const next = pinchLayer(shape({ w: 40, h: 40 }), { scale: 0.01, rotation: 0, dx: 0, dy: 0 }, measure as never, { w: 1000, h: 800 }) as ShapeLayer;
    expect(next.w).toBeGreaterThanOrEqual(8);
  });

  it('a pinch on text changes its size and turn, staying centred', () => {
    const base = newLayer({ x: 100, y: 100, maxWidth: 400, text: 'hello' });
    const t = { ...base, style: { ...base.style, size: 40 } };
    const m = measure as never;
    const before = (m as (l: unknown) => { w: number; h: number })(t);
    const out = pinchLayer(t, { scale: 1.5, rotation: -20, dx: 0, dy: 0 }, m, { w: 1000, h: 800 }) as typeof t;
    expect(out.style.size).toBe(60);
    expect(out.maxWidth).toBe(600);
    expect(out.rotation).toBe(-20);
    const after = (m as (l: unknown) => { w: number; h: number })(out);
    expect(out.x + after.w / 2).toBeCloseTo(100 + before.w / 2);
    expect(out.y + after.h / 2).toBeCloseTo(100 + before.h / 2);
  });

  it('ignores the first few degrees of a pinch, then grows from zero', () => {
    expect(softRotation(3)).toBe(0);
    expect(softRotation(-4)).toBe(0);
    expect(softRotation(10)).toBe(6);
    expect(softRotation(-10)).toBe(-6);
  });
});
