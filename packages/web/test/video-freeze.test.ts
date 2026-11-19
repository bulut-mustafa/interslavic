import { describe, expect, it, vi } from 'vitest';
import { freezeFrame, freezeSourceTime, insertFreeze, type FreezeEnv } from '../src/video/freeze.ts';
import { total, type Clip } from '../src/video/timeline.ts';

const clips: Clip[] = [
  { id: 'a', start: 0, end: 10, srcId: 'v' },
  { id: 'b', start: 0, end: 4, srcId: 'w', speed: 2 },
];

describe('freezeSourceTime', () => {
  it('maps edit time to the source and file', () => {
    expect(freezeSourceTime(clips, 3)).toEqual({ srcId: 'v', time: 3 });
    expect(freezeSourceTime(clips, 11)).toEqual({ srcId: 'w', time: 2 });
    expect(freezeSourceTime([], 1)).toBeNull();
    expect(freezeSourceTime([{ id: 'x', start: 0, end: 1 }], 0.5)).toBeNull();
  });
});

describe('insertFreeze', () => {
  it('splits the clip and puts a still of the given length between the halves', () => {
    const r = insertFreeze(clips, 4, 'img', 3);
    expect(r.map((c) => [c.start, c.end, c.srcId])).toEqual([[0, 4, 'v'], [0, 3, 'img'], [4, 10, 'v'], [0, 4, 'w']]);
    expect(total(r)).toBe(total(clips) + 3);
    expect(new Set(r.map((c) => c.id)).size).toBe(r.length);
    expect(r[1]!.speed).toBeUndefined();
  });
  it('keeps the halves speed', () => {
    const r = insertFreeze(clips, 11, 'img', 1);
    expect(r.map((c) => c.srcId)).toEqual(['v', 'w', 'img', 'w']);
    expect(r[1]!.speed).toBe(2);
    expect(r[3]!.speed).toBe(2);
  });
  it('near a clip edge it inserts at the edge without a sliver', () => {
    expect(insertFreeze(clips, 0.05, 'img', 2).map((c) => c.srcId)).toEqual(['img', 'v', 'w']);
    expect(insertFreeze(clips, 9.95, 'img', 2).map((c) => c.srcId)).toEqual(['v', 'img', 'w']);
  });
  it('does nothing for no clips, a bad length, or a missing source', () => {
    expect(insertFreeze([], 1, 'img', 2)).toEqual([]);
    expect(insertFreeze(clips, 1, 'img', 0)).toBe(clips);
    expect(insertFreeze(clips, 1, '', 2)).toBe(clips);
  });
});

function fakeVideo(over: Record<string, unknown> = {}, silent = false) {
  const listeners: Record<string, (() => void)[]> = {};
  const v: Record<string, unknown> = {
    videoWidth: 640,
    videoHeight: 360,
    readyState: 4,
    seeking: false,
    _t: 0,
    addEventListener: (n: string, f: () => void) => (listeners[n] ??= []).push(f),
    removeEventListener: (n: string, f: () => void) => (listeners[n] = (listeners[n] ?? []).filter((x) => x !== f)),
    ...over,
  };
  Object.defineProperty(v, 'currentTime', {
    get: () => v._t,
    set: (t: number) => {
      v._t = t;
      if (!silent) queueMicrotask(() => (listeners.seeked ?? []).slice().forEach((f) => f()));
    },
  });
  return { v: v as unknown as HTMLVideoElement, listeners };
}

function env(blob: Blob | null = new Blob(['x'])) {
  const drawImage = vi.fn();
  const toBlob = vi.fn((cb: (b: Blob | null) => void, _type?: string, _q?: number) => cb(blob));
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
  const e: FreezeEnv = { createCanvas: () => canvas as unknown as HTMLCanvasElement, timeoutMs: 50 };
  return { e, drawImage, toBlob, canvas };
}

describe('freezeFrame', () => {
  it('seeks, waits for seeked, draws at the video size and returns a PNG', async () => {
    const { v, listeners } = fakeVideo();
    const { e, drawImage, toBlob, canvas } = env();
    const blob = await freezeFrame(v, 2.5, 'png', e);
    expect(v.currentTime).toBe(2.5);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(drawImage).toHaveBeenCalledWith(v, 0, 0, 640, 360);
    expect(toBlob.mock.calls[0]![1]).toBe('image/png');
    expect(blob).toBeInstanceOf(Blob);
    expect(listeners.seeked).toHaveLength(0);
  });
  it('asks for JPEG with a quality', async () => {
    const { v } = fakeVideo();
    const { e, toBlob } = env();
    await freezeFrame(v, 1, 'jpeg', e);
    expect(toBlob.mock.calls[0]![1]).toBe('image/jpeg');
    expect(toBlob.mock.calls[0]![2]).toBe(0.92);
  });
  it('does not wait when already at that time', async () => {
    const { v } = fakeVideo({ _t: 1 });
    const { e, drawImage } = env();
    await freezeFrame(v, 1, 'png', e);
    expect(drawImage).toHaveBeenCalled();
  });
  it('rejects when the video has no picture yet', async () => {
    const { v } = fakeVideo({ videoWidth: 0 });
    await expect(freezeFrame(v, 1, 'png', env().e)).rejects.toThrow(/no picture/i);
  });
  it('rejects when seeked never comes', async () => {
    const { v } = fakeVideo({}, true);
    await expect(freezeFrame(v, 5, 'png', env().e)).rejects.toThrow(/seek/i);
  });
  it('rejects when toBlob gives null or draw throws', async () => {
    const a = fakeVideo();
    await expect(freezeFrame(a.v, 1, 'png', env(null).e)).rejects.toThrow(/could not/i);
    const b = fakeVideo();
    const x = env();
    x.drawImage.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(freezeFrame(b.v, 1, 'png', x.e)).rejects.toThrow(/boom/);
  });
});
