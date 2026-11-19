import { describe, expect, it } from 'vitest';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { editLength, emptyProject, fromV1, historyFromV1, isAudio, isMedia, isText, trackOf, type Layer, type MediaLayer } from '../src/video/project.ts';

const media = (over: Partial<MediaLayer> = {}): MediaLayer => ({ id: 'm', kind: 'media', srcId: 's1', in: 0, start: 0, end: 4, track: 1, x: 0, y: 0, w: 100, h: 50, rotation: 0, opacity: 1, blend: 'normal', ...over });

describe('project', () => {
  it('tells the three kinds of layer apart', () => {
    const text: Layer = newLayer({ x: 0, y: 0 });
    const m: Layer = media();
    const a: Layer = { id: 'a', kind: 'audio', srcId: 's2', in: 0, start: 0, end: 3, track: 0 };
    expect([isText(text), isMedia(text), isAudio(text)]).toEqual([true, false, false]);
    expect([isText(m), isMedia(m), isAudio(m)]).toEqual([false, true, false]);
    expect([isText(a), isMedia(a), isAudio(a)]).toEqual([false, false, true]);
  });

  it('puts a text layer without a lane on lane 0', () => {
    expect(trackOf(newLayer({ x: 0, y: 0 }))).toBe(0);
    expect(trackOf(newLayer({ x: 0, y: 0, track: 3 }))).toBe(3);
    expect(trackOf(media({ track: 2 }))).toBe(2);
  });

  it('upgrades a single-video edit: one source, every clip points at it, text kept', () => {
    const t = newLayer({ x: 1, y: 2, text: 'hi' });
    const p = fromV1({ clips: [{ id: 'c1', start: 0, end: 5 }], layers: [t] }, 'talk.mp4');
    expect(p.sources).toEqual([{ id: 's0', kind: 'video', name: 'talk.mp4' }]);
    expect(p.clips[0]!.srcId).toBe('s0');
    expect(p.layers).toEqual([t]);
    expect(p.frame).toBeNull();
  });

  it('keeps a clip that already names its source', () => {
    const p = fromV1({ clips: [{ id: 'c1', start: 0, end: 5, srcId: 'x' }], layers: [] }, 'a.mp4');
    expect(p.clips[0]!.srcId).toBe('x');
  });

  it('upgrades every undo step, so Undo still works', () => {
    type V1 = { clips: { id: string; start: number; end: number }[]; layers: ReturnType<typeof newLayer>[] };
    let h = H.start<V1>({ clips: [{ id: 'c', start: 0, end: 9 }], layers: [] });
    h = H.push(h, { clips: [{ id: 'c', start: 0, end: 4 }], layers: [] });
    h = H.push(h, { clips: [{ id: 'c', start: 1, end: 4 }], layers: [] });
    h = H.undo(h);
    const up = historyFromV1(h, 'v.mp4');
    expect(up.past).toHaveLength(h.past.length);
    expect(up.future).toHaveLength(h.future.length);
    expect([...up.past, up.present, ...up.future].every((p) => p.clips.every((c) => c.srcId === 's0'))).toBe(true);
  });

  it('is as long as the main track, or the last layer if it runs past', () => {
    const p = { ...emptyProject(), layers: [media({ end: 12 })] };
    expect(editLength(p, 8)).toBe(12);
    expect(editLength(p, 20)).toBe(20);
    expect(editLength(emptyProject(), 0)).toBe(0);
  });
});
