import { describe, expect, it } from 'vitest';
import { newLayer } from '../src/editor/layers.ts';
import { boxOf, hitLayers, inBox, stackOrder, visibleLayers } from '../src/video/boxes.ts';
import type { AudioLayer, MediaLayer } from '../src/video/project.ts';

const measure = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) };
const media = (over: Partial<MediaLayer> = {}): MediaLayer => ({ id: 'm', kind: 'media', srcId: 's1', in: 0, start: 0, end: 4, track: 1, x: 100, y: 100, w: 200, h: 100, rotation: 0, opacity: 1, blend: 'normal', ...over });

describe('boxOf', () => {
  it('gives a media layer its centre, size and rotation', () => {
    expect(boxOf(media({ rotation: 30 }))).toEqual({ id: 'm', cx: 200, cy: 150, w: 200, h: 100, rotation: 30 });
  });
  it('measures text with the editor layout; the centre is that of the unrotated box', () => {
    const t = newLayer({ id: 't', x: 10, y: 20, text: 'abcd', rotation: 90, style: { ...newLayer({ x: 0, y: 0 }).style, outline: null, box: null } });
    const b = boxOf(t, measure)!;
    expect(b.w).toBe(40);
    expect(b.cx).toBe(30);
    expect(b.cy).toBe(20 + b.h / 2);
    expect(b.rotation).toBe(90);
  });
  it('has no box for a sound', () => {
    const a: AudioLayer = { id: 'a', kind: 'audio', srcId: 's', in: 0, start: 0, end: 1, track: 0 };
    expect(boxOf(a)).toBeNull();
  });
});

describe('inBox', () => {
  it('inverse-rotates the point', () => {
    const b = { id: 'm', cx: 0, cy: 0, w: 200, h: 20, rotation: 90 };
    expect(inBox(b, 0, 80)).toBe(true); // the long side now points down
    expect(inBox(b, 80, 0)).toBe(false);
  });
});

describe('hitLayers', () => {
  it('hits a rotated rectangle only where it is', () => {
    const l = media({ x: 0, y: 90, w: 200, h: 20, rotation: 90 }); // centre (100,100), vertical bar
    expect(hitLayers([l], 100, 190)).toBe('m');
    expect(hitLayers([l], 190, 100)).toBeNull();
  });
  it('picks the higher lane, then the later layer in the list', () => {
    const back = media({ id: 'back', track: 1 });
    const front = media({ id: 'front', track: 2 });
    expect(hitLayers([front, back], 150, 120)).toBe('front');
    const a = media({ id: 'a', track: 1 });
    const b = media({ id: 'b', track: 1 });
    expect(hitLayers([a, b], 150, 120)).toBe('b');
  });
  it('misses outside, and outside the time window when a time is given', () => {
    const l = media({ start: 1, end: 2 });
    expect(hitLayers([l], 5, 5)).toBeNull();
    expect(hitLayers([l], 150, 120, undefined, 3)).toBeNull();
    expect(hitLayers([l], 150, 120, undefined, 1.5)).toBe('m');
  });
});

describe('visibleLayers / stackOrder', () => {
  it('keeps [start,end) and drops sounds', () => {
    const a: AudioLayer = { id: 'a', kind: 'audio', srcId: 's', in: 0, start: 0, end: 9, track: 0 };
    const l = media();
    expect(visibleLayers([l, a], 4).map((x) => x.id)).toEqual([]);
    expect(visibleLayers([l, a], 0).map((x) => x.id)).toEqual(['m']);
  });
  it('orders by lane, then list order', () => {
    const a = media({ id: 'a', track: 2 });
    const b = media({ id: 'b', track: 1 });
    const c = media({ id: 'c', track: 1 });
    expect(stackOrder([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('keeps list order within a lane when the list is already in lane order', () => {
    const l = [media({ id: 'a', track: 1 }), media({ id: 'b', track: 1 }), media({ id: 'c', track: 3 })];
    expect(stackOrder(l).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
