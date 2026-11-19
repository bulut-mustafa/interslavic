import type { Track } from '../src/video/keyframes.ts';
import { describe, expect, it } from 'vitest';
import type { MediaLayer, VideoProject } from '../src/video/project.ts';
import { emptyProject } from '../src/video/project.ts';
import type { TextLayer } from '../src/editor/layers.ts';
import {
  MAX_ZOOM, MIN_LAYER, MIN_ZOOM, clampZoom, clockLabel, dropGap, gapTime, indexAfterDrop, laneAtY, moveLayer, pxToTime, rulerTicks, scrollForAnchor, snap, snapPoints,
  snapSpan, clockTenths, keyMarks, mostCommon, moveKeysAt, slicePeaks, tickStep, timeToPx, topTrack, trimLayerEnd, trimLayerStart, zoomToFit,
} from '../src/video/timeline-math.ts';

const media = (over: Partial<MediaLayer> = {}): MediaLayer => ({ id: 'm', kind: 'media', srcId: 'v', start: 10, end: 20, track: 1, in: 5, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...over });
const text = (over: Partial<TextLayer> = {}): TextLayer => ({ id: 't', text: 'hi', x: 0, y: 0, maxWidth: 0, style: {} as never, start: 2, end: 4, track: 0, ...over });
const proj = (over: Partial<VideoProject> = {}): VideoProject => ({
  ...emptyProject(),
  sources: [{ id: 'v', kind: 'video', name: 'v', duration: 60 }, { id: 'i', kind: 'image', name: 'i' }, { id: 'a', kind: 'audio', name: 'a', duration: 30 }],
  clips: [{ id: 'a', srcId: 'v', start: 0, end: 10 }, { id: 'b', srcId: 'v', start: 20, end: 30 }],
  ...over,
});

describe('px and seconds', () => {
  it('converts both ways', () => {
    expect(timeToPx(2.5, 40)).toBe(100);
    expect(pxToTime(100, 40)).toBe(2.5);
    expect(pxToTime(-40, 40)).toBe(-1);
  });
  it('clamps zoom', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(1e9)).toBe(MAX_ZOOM);
    expect(clampZoom(NaN)).toBe(MIN_ZOOM);
  });
  it('fits a duration to a viewport, with some room', () => {
    expect(zoomToFit(10, 424, 24)).toBe(40);
    expect(zoomToFit(1e6, 400)).toBe(MIN_ZOOM);
    expect(zoomToFit(0.01, 400)).toBe(MAX_ZOOM);
    expect(zoomToFit(0, 400)).toBeGreaterThan(0);
  });
  it('keeps the anchor still when zooming', () => {
    expect(scrollForAnchor(10, 100, 50)).toBe(400);
    expect(scrollForAnchor(1, 300, 10)).toBe(0);
  });
});

describe('snapping', () => {
  it('lists playhead, 0, end and every edge once, sorted', () => {
    const p = proj({ layers: [text(), media({ start: 5, end: 20 })] });
    expect(snapPoints(p, undefined, 7)).toEqual([0, 2, 4, 5, 7, 10, 20]);
  });
  it('leaves out the item being dragged', () => {
    const p = proj({ layers: [text(), media({ start: 5, end: 15 })] });
    expect(snapPoints(p, 'm', 7)).toEqual([0, 2, 4, 7, 10, 20]);
    expect(snapPoints(p, 'b', 7)).not.toContain(20 + 0.001);
  });
  it('gives open-ended texts the edit length', () => {
    const p = proj({ layers: [text({ start: undefined, end: undefined })] });
    expect(snapPoints(p, undefined, 3)).toEqual([0, 3, 10, 20]);
  });
  it('snaps inside the threshold in pixels, not seconds', () => {
    expect(snap(5.1, [5], 8, 40)).toEqual({ time: 5, hit: 5 }); // 4 px
    expect(snap(5.3, [5], 8, 40)).toEqual({ time: 5.3, hit: null }); // 12 px
    expect(snap(5.3, [5], 8, 10)).toEqual({ time: 5, hit: 5 }); // 3 px at low zoom
  });
  it('is inclusive at the threshold, picks the nearest, and handles no points', () => {
    expect(snap(5.2, [5], 8, 40).hit).toBe(5);
    expect(snap(5.4, [5, 5.5], 8, 40).hit).toBe(5.5);
    expect(snap(1, [], 8, 40)).toEqual({ time: 1, hit: null });
  });
  it('works with negative times', () => {
    expect(snap(-0.1, [0], 8, 40)).toEqual({ time: 0, hit: 0 });
  });
  it('snaps a span by its nearer end', () => {
    expect(snapSpan(10.1, 15, [10], 8, 40)).toEqual({ shift: expect.closeTo(-0.1, 9), hit: 10 });
    expect(snapSpan(8, 14.95, [15], 8, 40).shift).toBeCloseTo(0.05);
    expect(snapSpan(8, 12, [20], 8, 40)).toEqual({ shift: 0, hit: null });
  });
});

describe('moving a layer', () => {
  it('keeps the length and never goes before 0', () => {
    expect(moveLayer(media(), 3)).toMatchObject({ start: 3, end: 13 });
    expect(moveLayer(media(), -4)).toMatchObject({ start: 0, end: 10 });
  });
  it('changes lane, never below 0', () => {
    expect(moveLayer(media(), 10, 3).track).toBe(3);
    expect(moveLayer(media(), 10, -2).track).toBe(0);
    expect(moveLayer(media(), 10).track).toBe(1);
  });
  it('moves a text with open ends', () => {
    expect(moveLayer(text({ start: undefined, end: undefined }), 1, 0, 20)).toMatchObject({ start: 1, end: 21 });
  });
});

describe('trimming a layer', () => {
  it('moves `in` with the left edge of a video', () => {
    const out = trimLayerStart(proj(), media(), 12);
    expect(out).toMatchObject({ start: 12, end: 20, in: 7 });
  });
  it('accounts for speed when moving `in`', () => {
    expect(trimLayerStart(proj(), media({ speed: 2 }), 12)).toMatchObject({ start: 12, in: 9 });
  });
  it('cannot pull the left edge before the source starts', () => {
    expect(trimLayerStart(proj(), media(), 0)).toMatchObject({ start: 5, in: 0 });
  });
  it('cannot go before 0 on the edit clock', () => {
    expect(trimLayerStart(proj(), media({ start: 2, end: 8, in: 30 }), -5)).toMatchObject({ start: 0, in: 28 });
  });
  it('keeps MIN_LAYER', () => {
    const out = trimLayerStart(proj(), media(), 99);
    expect(out.end - out.start).toBeCloseTo(MIN_LAYER);
    expect(trimLayerEnd(proj(), media(), 0).end).toBeCloseTo(10 + MIN_LAYER);
  });
  it('limits the right edge to the source', () => {
    expect(trimLayerEnd(proj(), media(), 500).end).toBe(10 + 55); // 60 s source, in 5
    expect(trimLayerEnd(proj(), media({ speed: 2 }), 500).end).toBe(10 + 27.5);
  });
  it('limits audio by its own source', () => {
    const a = { id: 'x', kind: 'audio' as const, srcId: 'a', start: 0, end: 10, track: 0, in: 10 };
    expect(trimLayerEnd(proj(), a, 100).end).toBe(20);
  });
  it('lets a picture or a text run as long as it likes and does not touch `in`', () => {
    const pic = media({ srcId: 'i', in: 0 });
    expect(trimLayerEnd(proj(), pic, 500).end).toBe(500);
    expect(trimLayerStart(proj(), pic, 12)).toMatchObject({ start: 12, in: 0 });
    expect(trimLayerEnd(proj(), text(), 100).end).toBe(100);
    expect(trimLayerStart(proj(), text(), -3).start).toBe(0);
  });
  it('lets a video of unknown length grow', () => {
    const p = proj({ sources: [{ id: 'v', kind: 'video', name: 'v' }] });
    expect(trimLayerEnd(p, media(), 500).end).toBe(500);
  });
});

describe('lanes', () => {
  it('finds the top lane in use', () => {
    expect(topTrack(proj())).toBe(-1);
    expect(topTrack(proj({ layers: [text(), media({ track: 3 })] }))).toBe(3);
  });
  it('maps a vertical position to a lane, highest on top', () => {
    expect(laneAtY(0, 30, 3)).toBe(3);
    expect(laneAtY(29, 30, 3)).toBe(3);
    expect(laneAtY(30, 30, 3)).toBe(2);
    expect(laneAtY(95, 30, 3)).toBe(0);
    expect(laneAtY(500, 30, 3)).toBe(0);
    expect(laneAtY(-50, 30, 3)).toBe(3);
  });
});

describe('main track drop', () => {
  const clips = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 0, end: 10 }, { id: 'c', start: 0, end: 10 }];
  it('finds the gap by the middles of the clips', () => {
    expect(dropGap(clips, 2)).toBe(0);
    expect(dropGap(clips, 6)).toBe(1);
    expect(dropGap(clips, 16)).toBe(2);
    expect(dropGap(clips, 99)).toBe(3);
    expect(dropGap(clips, -5)).toBe(0);
  });
  it('converts a gap to the final index', () => {
    expect(indexAfterDrop(0, 3)).toBe(2);
    expect(indexAfterDrop(2, 0)).toBe(0);
    expect(indexAfterDrop(1, 1)).toBe(1);
    expect(indexAfterDrop(1, 2)).toBe(1);
  });
  it('gives the time of a gap', () => {
    expect(gapTime(clips, 2)).toBe(20);
    expect(gapTime(clips, 99)).toBe(30);
  });
});

describe('ruler', () => {
  it('picks the smallest nice step that leaves room for labels', () => {
    expect(tickStep(100)).toBe(1);
    expect(tickStep(10)).toBe(10);
    expect(tickStep(MAX_ZOOM)).toBe(0.2);
    expect(tickStep(0.0001)).toBe(3600);
  });
  it('lays out ticks with labels on the major ones', () => {
    const t = rulerTicks(100, 300);
    expect(t[0]).toEqual({ t: 0, major: true, label: '0:00' });
    expect(t.filter((x) => x.major).map((x) => x.t)).toEqual([0, 1, 2, 3]);
    expect(t.length).toBe(16);
  });
  it('starts at the scroll position and never goes negative', () => {
    expect(rulerTicks(100, 200, 59.5).filter((x) => x.major)[0]).toEqual({ t: 60, major: true, label: '1:00' });
    expect(rulerTicks(100, 200, -3).every((x) => x.t >= 0)).toBe(true);
  });
  it('is empty without room', () => {
    expect(rulerTicks(0, 100)).toEqual([]);
    expect(rulerTicks(10, 0)).toEqual([]);
  });
  it('formats clock labels', () => {
    expect(clockLabel(65)).toBe('1:05');
    expect(clockLabel(1.5, 0.5)).toBe('0:01.5');
  });
});

describe('slicePeaks', () => {
  const peaks = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n / 10));
  it('takes the part of the peaks the item plays', () => {
    expect(Array.from(slicePeaks(peaks, 2, 5, 10)).map((v) => Math.round(v * 10))).toEqual([2, 3, 4]);
  });
  it('clamps to the source and never returns less than one value for a real range', () => {
    expect(slicePeaks(peaks, 8, 99, 10).length).toBe(2);
    expect(slicePeaks(peaks, 3, 3.01, 10).length).toBe(1);
  });
  it('is empty for no peaks, and whole when the duration is unknown', () => {
    expect(slicePeaks(new Float32Array(0), 0, 5, 10).length).toBe(0);
    expect(slicePeaks(peaks, 0, 5, 0).length).toBe(10);
  });
  it('is empty when the range is outside the source', () => {
    expect(slicePeaks(peaks, 20, 30, 10).length).toBe(0);
  });
});

describe('keyframe marks', () => {
  const k = (t: number) => ({ t, value: 0, ease: 'linear' as const });
  const tracks: Track[] = [
    { prop: 'x', keys: [k(0), k(1.5)] },
    { prop: 'opacity', keys: [k(1.5), k(9)] },
  ];
  it('lists key times once across properties, clamped into the bar', () => {
    expect(keyMarks(tracks, 4)).toEqual([0, 1.5, 4]);
    expect(keyMarks(undefined, 4)).toEqual([]);
  });
  it('moves the keys of every property at that time and keeps them inside the bar', () => {
    const out = moveKeysAt(tracks, 1.5, 2, 4);
    expect(out.map((t) => t.keys.map((x) => x.t))).toEqual([[0, 2], [2, 9]]);
    const far = moveKeysAt(tracks, 1.5, 99, 4);
    expect(far[0]!.keys.map((x) => x.t)).toEqual([0, 4]);
    expect(moveKeysAt(tracks, 1.5, -3, 4)[1]!.keys[0]!.t).toBe(0);
  });
});

describe('clockTenths and mostCommon', () => {
  it('writes m:ss.s without rolling over wrongly', () => {
    expect(clockTenths(2.5)).toBe('0:02.5');
    expect(clockTenths(59.96)).toBe('1:00.0');
    expect(clockTenths(75.04)).toBe('1:15.0');
  });
  it('picks the most common, the first of a tie', () => {
    expect(mostCommon(['a', 'b', 'b'])).toBe('b');
    expect(mostCommon(['a', 'b'])).toBe('a');
    expect(mostCommon([])).toBeUndefined();
  });
});
