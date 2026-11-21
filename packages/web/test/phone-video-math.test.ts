import { describe, expect, it } from 'vitest';
import {
  FRICTION, MAX_ZOOM, MIN_ZOOM, flingAt, offsetOfTime, pinchZoom, screenXOf, scrubSnap, scrubTime, timeAtOffset, timeAtScreenX, velocityOf,
} from '../src/phone/video/scrub-math.ts';
import { JOINT_PX, MAIN_H, MAX_ROWS, RULER_H, ROW_H, geometryOf, hitAt, lanesOf, moveDrag, scrubPoints, trimDrag } from '../src/phone/video/timeline-model.ts';
import { ANGLE_SNAP, movedTo, snapAngle, transformedMedia, transformedText } from '../src/phone/video/preview-math.ts';
import { diamondOn, frameForRatio, modeOf, ratioLabel, toggleDiamond, toolsFor } from '../src/phone/video/tools.ts';
import type { MediaLayer } from '../src/video/project.ts';
import { videoProject, textLayer, mediaLayer, soundLayer } from './phone-video-fixtures.ts';

describe('centre-playhead scrub maths', () => {
  it('scroll offset and time are inverse, clamped to the edit', () => {
    expect(offsetOfTime(2.5, 40)).toBe(100);
    expect(timeAtOffset(100, 40, 10)).toBe(2.5);
    expect(timeAtOffset(-30, 40, 10)).toBe(0);
    expect(timeAtOffset(9999, 40, 10)).toBe(10);
  });

  it('screen x is centre + (t - time) * zoom, and timeAtScreenX inverts it', () => {
    const centre = 195;
    expect(screenXOf(3, 3, 50, centre)).toBe(195); // what is under the playhead is at the centre
    expect(screenXOf(4, 3, 50, centre)).toBe(245);
    expect(screenXOf(2, 3, 50, centre)).toBe(145);
    for (const t of [0, 1.25, 7]) expect(timeAtScreenX(screenXOf(t, 3, 50, centre), 3, 50, centre)).toBeCloseTo(t, 9);
  });

  it('dragging right moves the playhead earlier; zoom and the edit clamp it', () => {
    expect(scrubTime(5, 100, 50, 20)).toBe(3);
    expect(scrubTime(5, -100, 50, 20)).toBe(7);
    expect(scrubTime(1, 500, 50, 20)).toBe(0);
    expect(scrubTime(19, -500, 50, 20)).toBe(20);
    // at double the zoom the same finger travel is half the time
    expect(scrubTime(5, 100, 100, 20)).toBe(4);
  });

  it('a pinch scales the zoom within limits and ignores nonsense; the playhead time is not an input', () => {
    expect(pinchZoom(50, 2)).toBe(100);
    expect(pinchZoom(50, 0.5)).toBe(25);
    expect(pinchZoom(50, 1e6)).toBe(MAX_ZOOM);
    expect(pinchZoom(50, 1e-6)).toBe(MIN_ZOOM);
    expect(pinchZoom(50, NaN)).toBe(50);
    expect(pinchZoom(50, -2)).toBe(50);
  });

  it('sticks to an edge within 6 px of screen and not beyond', () => {
    expect(scrubSnap(4.05, [0, 4, 8], 50).hit).toBe(4); // 2.5 px away
    expect(scrubSnap(4.2, [0, 4, 8], 50).hit).toBeNull(); // 10 px away
    expect(scrubSnap(4.2, [0, 4, 8], 50).time).toBe(4.2);
  });

  it('a fling slows exponentially and stops; speed comes from the last 100 ms', () => {
    const v = velocityOf([{ x: 0, t: 0 }, { x: 40, t: 50 }, { x: 100, t: 100 }]);
    expect(v).toBeCloseTo(1, 5);
    expect(velocityOf([{ x: 0, t: 0 }])).toBe(0);
    expect(velocityOf([{ x: 0, t: 0 }, { x: 100, t: 1000 }])).toBe(0); // too old
    const a = flingAt(1, 0);
    expect(a.dist).toBe(0);
    expect(a.speed).toBe(1);
    const b = flingAt(1, 100);
    expect(b.speed).toBeCloseTo(Math.exp(-FRICTION * 100), 9);
    expect(b.dist).toBeGreaterThan(0);
    expect(flingAt(1, 5000).done).toBe(true);
    expect(flingAt(-1, 100).dist).toBeLessThan(0);
    // total travel is bounded by v0 / friction
    expect(Math.abs(flingAt(1, 1e6).dist)).toBeCloseTo(1 / FRICTION, 3);
  });
});

describe('timeline model', () => {
  const p = videoProject({ clips: [4, 6], layers: [textLayer('t1', 1, 3, 0), mediaLayer('m1', 2, 6, 1), soundLayer('a1', 0, 8, 2)] });
  const z = 50;

  it('rows are the lanes in use, highest first, at most three shown', () => {
    expect(lanesOf(p)).toEqual([2, 1, 0]);
    const g = geometryOf(p);
    expect(g.shown).toBe(3);
    expect(g.mainTop).toBe(RULER_H + 3 * ROW_H);
    expect(g.height).toBe(g.mainTop + MAIN_H);
    expect(g.maxRowScroll).toBe(0);
    const many = videoProject({ clips: [4], layers: [0, 1, 2, 3, 4].map((i) => textLayer(`t${i}`, 0, 1, i)) });
    expect(geometryOf(many).shown).toBe(MAX_ROWS);
    expect(geometryOf(many).maxRowScroll).toBe(2 * ROW_H);
  });

  it('what a finger hits: clip, joint before clip, layer on its row, add after the end, empty', () => {
    const g = geometryOf(p);
    const main = g.mainTop + 10;
    expect(hitAt(p, main, 1, z)).toEqual({ kind: 'clip', id: p.clips[0]!.id, index: 0 });
    expect(hitAt(p, main, 7, z)).toEqual({ kind: 'clip', id: p.clips[1]!.id, index: 1 });
    // the join at 4 s: within JOINT_PX
    expect(hitAt(p, main, 4 + (JOINT_PX - 2) / z, z)).toEqual({ kind: 'joint', id: p.clips[1]!.id });
    expect(hitAt(p, main, 4 + (JOINT_PX + 6) / z, z).kind).toBe('clip');
    expect(hitAt(p, main, 10 + 20 / z, z)).toEqual({ kind: 'add' });
    expect(hitAt(p, main, 10 + 200 / z, z)).toEqual({ kind: 'empty' });
    // rows: lane 2 (the sound) is the first row, lane 1 the media, lane 0 the text
    expect(hitAt(p, RULER_H + 5, 3, z)).toEqual({ kind: 'layer', id: 'a1' });
    expect(hitAt(p, RULER_H + ROW_H + 5, 3, z)).toEqual({ kind: 'layer', id: 'm1' });
    expect(hitAt(p, RULER_H + 2 * ROW_H + 5, 2, z)).toEqual({ kind: 'layer', id: 't1' });
    expect(hitAt(p, RULER_H + 2 * ROW_H + 5, 9, z)).toEqual({ kind: 'empty' });
    expect(hitAt(p, 4, 3, z)).toEqual({ kind: 'empty' }); // the ruler
  });

  it('scrolled rows hit the row that is under the finger', () => {
    const many = videoProject({ clips: [4], layers: [0, 1, 2, 3, 4].map((i) => textLayer(`t${i}`, 0, 2, i)) });
    // lanes 4,3,2,1,0 -> row 0 is lane 4. Scrolled one row, the first visible row is lane 3.
    expect(hitAt(many, RULER_H + 5, 1, z, 0)).toEqual({ kind: 'layer', id: 't4' });
    expect(hitAt(many, RULER_H + 5, 1, z, ROW_H)).toEqual({ kind: 'layer', id: 't3' });
  });

  it('trimming the end of a main clip ripples what follows and keeps the clip inside its source', () => {
    const o = p;
    const clip = o.clips[0]!;
    const x0 = 4 * z;
    const r = trimDrag({ target: { kind: 'clip', id: clip.id }, x0, origin: o }, 'end', x0 - 2 * z, { zoom: z, time: 0, snapping: false });
    expect(r.change.clips![0]!.end).toBeCloseTo(2, 6);
    expect(r.change.clips![1]).toEqual(o.clips[1]); // the next clip is untouched, it just starts earlier
    const past = trimDrag({ target: { kind: 'clip', id: clip.id }, x0, origin: o }, 'end', x0 + 100 * z, { zoom: z, time: 0, snapping: false });
    expect(past.change.clips![0]!.end).toBeLessThanOrEqual(60); // the fake source is 60 s long
  });

  it('trimming the start of a main clip moves its in point, never below 0', () => {
    const clip = p.clips[1]!;
    const x0 = 4 * z;
    const r = trimDrag({ target: { kind: 'clip', id: clip.id }, x0, origin: p }, 'start', x0 + 1 * z, { zoom: z, time: 0, snapping: false });
    expect(r.change.clips![1]!.start).toBeCloseTo(1, 6);
    const lo = trimDrag({ target: { kind: 'clip', id: clip.id }, x0, origin: p }, 'start', x0 - 100 * z, { zoom: z, time: 0, snapping: false });
    expect(lo.change.clips![1]!.start).toBe(0);
  });

  it('trimming a layer edge changes its span; snapping goes to the playhead', () => {
    const l = p.layers.find((x) => x.id === 't1')!;
    const x0 = 3 * z;
    const r = trimDrag({ target: { kind: 'layer', id: 't1' }, x0, origin: p }, 'end', x0 + 1 * z, { zoom: z, time: 0, snapping: false });
    expect(r.change.layers!.find((x) => x.id === 't1')!.end).toBeCloseTo(4, 6);
    const s = trimDrag({ target: { kind: 'layer', id: 't1' }, x0, origin: p }, 'end', x0 + 1 * z - 2, { zoom: z, time: 4, snapping: true });
    expect(s.change.layers!.find((x) => x.id === 't1')!.end).toBe(4); // snapped to the playhead
    expect(s.guide).toBe(4);
    expect(l.start).toBe(1);
  });

  it('reordering: the gap under the finger decides, the marker says where, other clips are untouched', () => {
    const o = videoProject({ clips: [3, 3, 3] });
    const first = o.clips[0]!.id;
    // dropped past the middle of the second clip (at 4.6 s): the first ends up second
    const r = moveDrag({ target: { kind: 'clip', id: first }, x0: 0, origin: o }, 4.6 * z, { zoom: z, time: 0 });
    expect(r.change.clips!.map((c) => c.id)).toEqual([o.clips[1]!.id, first, o.clips[2]!.id]);
    expect(r.marker).toBe(6);
    // dropped in place: no change in order
    const same = moveDrag({ target: { kind: 'clip', id: first }, x0: 0, origin: o }, 0.5 * z, { zoom: z, time: 0 });
    expect(same.change.clips!.map((c) => c.id)).toEqual(o.clips.map((c) => c.id));
    // to the very end
    const end = moveDrag({ target: { kind: 'clip', id: first }, x0: 0, origin: o }, 20 * z, { zoom: z, time: 0 });
    expect(end.change.clips!.map((c) => c.id)).toEqual([o.clips[1]!.id, o.clips[2]!.id, first]);
  });

  it('moving a layer slides it in time, keeps its length and lane, never before 0, and snaps to the playhead', () => {
    const x0 = 2 * z;
    const r = moveDrag({ target: { kind: 'layer', id: 'm1' }, x0, origin: p }, x0 + 2 * z, { zoom: z, time: 0, snapping: false });
    const m = r.change.layers!.find((x) => x.id === 'm1') as MediaLayer;
    expect(m.start).toBeCloseTo(4, 6);
    expect(m.end).toBeCloseTo(8, 6);
    expect(m.track).toBe(1);
    const before = moveDrag({ target: { kind: 'layer', id: 'm1' }, x0, origin: p }, x0 - 50 * z, { zoom: z, time: 0, snapping: false });
    expect((before.change.layers!.find((x) => x.id === 'm1') as MediaLayer).start).toBe(0);
    const snapped = moveDrag({ target: { kind: 'layer', id: 'm1' }, x0, origin: p }, x0 + 2 * z + 3, { zoom: z, time: 4.0, snapping: true });
    expect((snapped.change.layers!.find((x) => x.id === 'm1') as MediaLayer).start).toBe(4);
  });

  it('scrub points are 0, the end, joins and layer edges, sorted and unique', () => {
    expect(scrubPoints(p)).toEqual([0, 1, 2, 3, 4, 6, 8, 10]);
  });
});

describe('preview maths', () => {
  const frame = { w: 1000, h: 500 };
  it('a drag moves by frame pixels (screen px over k) and stays on the frame', () => {
    expect(movedTo({ x: 100, y: 100 }, 50, 20, 0.5, frame)).toEqual({ x: 200, y: 140 });
    expect(movedTo({ x: 100, y: 100 }, 1e6, 1e6, 0.5, frame).x).toBeLessThan(frame.w);
  });
  it('a pinch scales a picture about its centre, a twist turns it, the midpoint moves it', () => {
    const base = { x: 100, y: 100, w: 200, h: 100, rotation: 0 };
    const r = transformedMedia(base, 2, 30, { dx: 0, dy: 0 }, 1);
    expect(r.w).toBe(400);
    expect(r.h).toBe(200);
    expect(r.x + r.w / 2).toBe(200); // same centre
    expect(r.y + r.h / 2).toBe(150);
    expect(r.rotation).toBe(30);
    const moved = transformedMedia(base, 1, 0, { dx: 10, dy: -20 }, 0.5);
    expect(moved.x).toBe(120);
    expect(moved.y).toBe(60);
    expect(transformedMedia(base, 0.0001, 0, { dx: 0, dy: 0 }, 1).w).toBeGreaterThanOrEqual(8);
  });
  it('a turn near a right angle snaps to it', () => {
    expect(snapAngle(ANGLE_SNAP - 1)).toBe(0);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(-91)).toBe(-90);
    expect(snapAngle(178)).toBe(180);
    expect(snapAngle(45)).toBe(45);
    expect(snapAngle(370)).toBe(10);
  });
  it('text pinches its size within limits and turns', () => {
    expect(transformedText({ size: 40, rotation: 0 }, 2, 15, 200)).toEqual({ size: 80, rotation: 15 });
    expect(transformedText({ size: 40, rotation: 0 }, 100, 0, 200).size).toBe(200);
    expect(transformedText({ size: 40, rotation: 0 }, 0.01, 0, 200).size).toBe(8);
  });
});

describe('the strip follows the selection', () => {
  const p = videoProject({ clips: [4, 6], layers: [textLayer('t1', 1, 3, 0), mediaLayer('m1', 2, 6, 1), soundLayer('a1', 0, 8, 2)] });
  const ids = (sel: Parameters<typeof toolsFor>[1]) => toolsFor(p, sel).items.map((i) => i.id);
  it('nothing selected: project tools', () => {
    expect(modeOf(p, null)).toBe('project');
    expect(ids(null)).toEqual(['edit', 'audio', 'text', 'overlay', 'effects', 'transitions', 'ratio', 'captions', 'voice']);
  });
  it('a clip: split, speed, volume, animate, effects, delete', () => {
    expect(ids({ kind: 'clip', id: p.clips[0]!.id })).toEqual(['split', 'speed', 'volume', 'animate', 'effects', 'delete']);
  });
  it('a text, a picture/video and a sound each have their own set', () => {
    expect(ids({ kind: 'layer', id: 't1' })).toEqual(['type', 'style', 'animate', 'translate', 'duplicate', 'delete']);
    expect(ids({ kind: 'layer', id: 'm1' })).toEqual(['effects', 'animate', 'opacity', 'speed', 'volume', 'duplicate', 'delete']);
    expect(ids({ kind: 'layer', id: 'a1' })).toEqual(['volume', 'speed', 'duplicate', 'delete']);
  });
  it('a selection that no longer exists falls back to the project tools', () => {
    expect(modeOf(p, { kind: 'layer', id: 'gone' })).toBe('project');
    expect(modeOf(p, { kind: 'clip', id: 'gone' })).toBe('project');
  });
  it('the only clip cannot be deleted; transitions need two clips', () => {
    const one = videoProject({ clips: [4] });
    expect(toolsFor(one, { kind: 'clip', id: one.clips[0]!.id }, { canDeleteClip: false }).items.find((i) => i.id === 'delete')!.disabled).toBe(true);
    expect(toolsFor(one, null).items.find((i) => i.id === 'transitions')!.disabled).toBe(true);
    expect(toolsFor(p, null).items.find((i) => i.id === 'transitions')!.disabled).toBe(false);
  });
});

describe('the keyframe diamond', () => {
  const m = mediaLayer('m1', 2, 6, 1);
  it('adds a key for every property at the playhead, and a second press removes them', () => {
    const on = toggleDiamond(m, m, 1);
    expect(on.map((t) => t.prop).sort()).toEqual(['h', 'opacity', 'rotation', 'w', 'x', 'y']);
    expect(on.find((t) => t.prop === 'x')!.keys[0]).toMatchObject({ t: 1, value: m.x });
    const withKeys = { ...m, tracks: on };
    expect(diamondOn(withKeys, 1)).toBe(true);
    expect(diamondOn(withKeys, 3)).toBe(false);
    expect(toggleDiamond(withKeys, withKeys, 1).flatMap((t) => t.keys)).toHaveLength(0);
  });
  it('keys what the layer is NOW (keyframes resolved), not the stored value', () => {
    const now = { ...m, x: 777 };
    expect(toggleDiamond(m, now, 0.5).find((t) => t.prop === 'x')!.keys[0]!.value).toBe(777);
  });
  it('text keys position and rotation only; sound has no diamond', () => {
    const t = textLayer('t1', 0, 3, 0);
    expect(toggleDiamond(t, t, 0).map((x) => x.prop).sort()).toEqual(['rotation', 'x', 'y']);
    expect(diamondOn(soundLayer('a', 0, 3, 0), 0)).toBe(false);
  });
});

describe('ratios', () => {
  it('frames have an even long side of 1280 and the right shape', () => {
    expect(frameForRatio(16 / 9)).toEqual({ w: 1280, h: 720 });
    expect(frameForRatio(9 / 16)).toEqual({ w: 720, h: 1280 });
    expect(frameForRatio(1)).toEqual({ w: 1280, h: 1280 });
    expect(frameForRatio(4 / 5)).toEqual({ w: 1024, h: 1280 });
  });
  it('a frame is named by its ratio', () => {
    expect(ratioLabel(null)).toBe('Original');
    expect(ratioLabel({ w: 1280, h: 720 })).toBe('16:9');
    expect(ratioLabel({ w: 720, h: 1280 })).toBe('9:16');
    expect(ratioLabel({ w: 1000, h: 777 })).toBe('1000:777');
  });
});
