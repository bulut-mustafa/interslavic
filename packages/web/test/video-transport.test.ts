import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/video/media-pool.ts';
import { emptyProject, type AudioLayer, type MediaLayer, type VideoProject } from '../src/video/project.ts';
import { DRIFT_LIMIT } from '../src/video/schedule.ts';
import { RATE_MAX, RATE_MIN, clampRate, createTransportWith } from '../src/video/transport.ts';

class FakeMedia extends EventTarget {
  src = '';
  paused = true;
  ended = false;
  readyState = 4;
  volume = 1;
  playbackRate = 1;
  preservesPitch = false;
  preload = '';
  playsInline = false;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  sets: number[] = [];
  autoSeeked = true;
  playResult: () => Promise<void> = () => Promise.resolve();
  private t = 0;
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    this.sets.push(v);
    if (this.autoSeeked) queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
  play() {
    this.playCalls++;
    this.paused = false;
    return this.playResult();
  }
  pause() {
    this.pauseCalls++;
    this.paused = true;
  }
  load() {
    this.loadCalls++;
  }
  removeAttribute(n: string) {
    if (n === 'src') this.src = '';
  }
}

const media = (id: string, srcId: string, start: number, end: number, extra: Partial<MediaLayer> = {}): MediaLayer => ({
  id, kind: 'media', srcId, in: 0, start, end, track: 1, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...extra,
});
const audio = (id: string, start: number, end: number, extra: Partial<AudioLayer> = {}): AudioLayer => ({ id, kind: 'audio', srcId: 'au', in: 0, start, end, track: 2, ...extra });

const base = (): VideoProject => ({
  ...emptyProject(),
  sources: [
    { id: 'v1', kind: 'video', name: '1', duration: 60 },
    { id: 'v2', kind: 'video', name: '2', duration: 60 },
    { id: 'au', kind: 'audio', name: 'a', duration: 60 },
  ],
  clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10 }, { id: 'b', srcId: 'v2', start: 20, end: 25 }],
});

let clockMs = 0;
let rafCb: (() => void) | null = null;
let made: Record<string, FakeMedia[]>;
let project: VideoProject;
let onFrame: ReturnType<typeof vi.fn>;
let onEnded: ReturnType<typeof vi.fn>;

const frameStep = (ms: number) => {
  clockMs += ms;
  const cb = rafCb;
  rafCb = null;
  cb?.();
};
/** The live (not released) fake element playing a file. */
const live = (src: string): FakeMedia[] => [...(made.video ?? []), ...(made.audio ?? [])].filter((f) => f.src === `blob:${src}`);
const one = (src: string): FakeMedia => {
  const l = live(src);
  expect(l.length).toBe(1);
  return l[0]!;
};

function make(opts: { maxVideos?: number; sink?: boolean } = {}) {
  const gains: { gain: { value: number } }[] = [];
  const ctx = {
    createMediaElementSource: vi.fn(() => ({ connect() {}, disconnect() {} })),
    createGain: vi.fn(() => {
      const g = { gain: { value: 1 }, connect() {}, disconnect() {} };
      gains.push(g);
      return g;
    }),
  };
  const tr = createTransportWith(
    {
      getProject: () => project,
      files: { urlOf: (id) => `blob:${id}` },
      hooks: { onFrame, onEnded },
      sink: opts.sink ? ({ context: ctx, destination: {} } as never) : undefined,
    },
    {
      now: () => clockMs,
      raf: (cb) => {
        rafCb = cb;
        return 1;
      },
      caf: () => {
        rafCb = null;
      },
      maxVideos: opts.maxVideos,
      create: (kind) => {
        const f = new FakeMedia();
        (made[kind] ??= []).push(f);
        return f as never;
      },
    },
  );
  return Object.assign(tr, { gains, ctx });
}

beforeEach(() => {
  clockMs = 0;
  rafCb = null;
  made = {};
  project = base();
  onFrame = vi.fn();
  onEnded = vi.fn();
});
afterEach(() => vi.useRealTimers());

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('rate clamp', () => {
  it('stays inside the audible range', () => {
    expect(clampRate(0.01)).toBe(RATE_MIN);
    expect(clampRate(100)).toBe(RATE_MAX);
    expect(clampRate(1.5)).toBe(1.5);
  });
});

describe('active elements', () => {
  it('plays only the clip at the boundary and preloads the next', async () => {
    const tr = make();
    tr.seek(9.99);
    await flush();
    await tr.play();
    expect(one('v1').paused).toBe(false);
    // v2 starts within the lookahead: made, parked on its first frame, not playing
    expect(one('v2').paused).toBe(true);
    expect(one('v2').currentTime).toBe(20);
    frameStep(30); // 10.02 s: the boundary
    expect(one('v2').paused).toBe(false);
    expect(live('v1')).toHaveLength(0); // released
    tr.dispose();
  });

  it('pauses and releases an item that leaves its window', async () => {
    project = { ...base(), layers: [media('m', 'v2', 1, 2)] };
    const tr = make();
    await tr.play();
    frameStep(2500);
    const m = made.video!.find((f) => f.src === '')!; // released one has its src cleared
    expect(m).toBeDefined();
    expect(m.pauseCalls).toBeGreaterThan(0);
    expect(m.loadCalls).toBe(1);
    tr.dispose();
  });

  it('a clip with speed 2 sets playbackRate 2, pitch kept, and the source time moves twice as fast', async () => {
    project = { ...base(), clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10, speed: 2 }] };
    const tr = make();
    await tr.play();
    const el = one('v1');
    expect(el.playbackRate).toBe(2);
    expect(el.preservesPitch).toBe(true);
    el.currentTime = 4; // as if the element ran at 2x for 2 s
    el.sets.length = 0;
    frameStep(2000);
    expect(el.sets).toEqual([]); // 2 s of edit = 4 s of source: no drift
    tr.dispose();
  });

  it('applies item volume on the element in preview', async () => {
    project = { ...base(), layers: [audio('s', 0, 8, { volume: 0.5, fadeIn: 2 })] };
    const tr = make();
    tr.setMasterVolume(1);
    await tr.play();
    frameStep(1000);
    expect(one('au').volume).toBeCloseTo(0.25);
    tr.dispose();
  });

  it('in sink mode routes through a gain node (made once) and leaves element volume alone', async () => {
    project = { ...base(), layers: [audio('s', 0, 8, { volume: 0.5 })] };
    const tr = make({ sink: true });
    await tr.play();
    frameStep(100);
    frameStep(100);
    // one source node per element (main clip + audio layer), however many frames ran
    expect(tr.ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
    expect(tr.ctx.createGain).toHaveBeenCalledTimes(2);
    expect(tr.gains.some((g) => g.gain.value === 0.5)).toBe(true);
    expect(one('au').volume).toBe(1);
    tr.dispose();
  });
});

describe('drift', () => {
  it('seeks only once the element is more than DRIFT_LIMIT off', async () => {
    const tr = make();
    await tr.play();
    const el = one('v1');
    el.currentTime = 0.5 + DRIFT_LIMIT - 0.05;
    el.sets.length = 0;
    frameStep(500);
    expect(el.sets).toEqual([]);
    el.currentTime = 1.0 + DRIFT_LIMIT + 0.2;
    el.sets.length = 0;
    frameStep(500);
    expect(el.sets).toHaveLength(1);
    expect(el.sets[0]).toBeCloseTo(1.0);
    tr.dispose();
  });
});

describe('clock, end and play errors', () => {
  it('is driven by the clock and ends at the edit length', async () => {
    const tr = make();
    await tr.play();
    frameStep(5000);
    expect(tr.time).toBeCloseTo(5);
    frameStep(11000);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(tr.playing).toBe(false);
    expect(tr.time).toBe(15);
    expect(one('v1').paused).toBe(true);
    tr.dispose();
  });

  it('a layer running past the main track extends the edit', async () => {
    project = { ...base(), layers: [audio('s', 0, 20)] };
    const tr = make();
    await tr.play();
    frameStep(16000);
    expect(onEnded).not.toHaveBeenCalled();
    frameStep(4100);
    expect(onEnded).toHaveBeenCalledTimes(1);
    tr.dispose();
  });

  it('rethrows NotAllowedError from play() and pauses; swallows other rejections', async () => {
    const tr = make();
    tr.seek(0);
    await flush();
    const orig = FakeMedia.prototype.play;
    FakeMedia.prototype.play = function () {
      this.paused = false;
      return Promise.reject(new DOMException('no', 'NotAllowedError'));
    };
    await expect(tr.play()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(tr.playing).toBe(false);
    FakeMedia.prototype.play = function () {
      this.paused = false;
      return Promise.reject(new DOMException('no', 'AbortError'));
    };
    await expect(tr.play()).resolves.toBeUndefined();
    expect(() => frameStep(100)).not.toThrow();
    FakeMedia.prototype.play = orig;
    tr.dispose();
  });

  it('pause() pauses every element and holds the time', async () => {
    const tr = make();
    await tr.play();
    frameStep(2000);
    tr.pause();
    expect(one('v1').paused).toBe(true);
    clockMs += 5000;
    expect(tr.time).toBeCloseTo(2);
    tr.dispose();
  });
});

describe('seek while paused', () => {
  it('puts every active element on the frame and calls onFrame once they have seeked', async () => {
    project = { ...base(), layers: [media('m', 'v2', 0, 10, { in: 30 })] };
    const tr = make();
    onFrame.mockClear();
    tr.seek(4);
    expect(onFrame).not.toHaveBeenCalled(); // waiting for seeked
    await flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(one('v1').currentTime).toBe(4);
    expect(live('v2').some((f) => f.currentTime === 34)).toBe(true);
    tr.dispose();
  });

  it('does not hang when seeked never comes', async () => {
    vi.useFakeTimers();
    const tr = make();
    // every element made from now on never reports seeked
    const origSet = Object.getOwnPropertyDescriptor(FakeMedia.prototype, 'currentTime')!;
    Object.defineProperty(FakeMedia.prototype, 'currentTime', { ...origSet, set(v: number) { (this as never as { t: number }).t = v; }, configurable: true });
    tr.seek(4);
    expect(onFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(onFrame).toHaveBeenCalledTimes(1);
    Object.defineProperty(FakeMedia.prototype, 'currentTime', { ...origSet, configurable: true });
    tr.dispose();
  });

  it('calls onFrame at once when nothing needs seeking', () => {
    project = { ...base(), clips: [] };
    const tr = make();
    tr.seek(0);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });
});

describe('pool', () => {
  it('evicts the least recently used unprotected video at the cap', () => {
    let n = 0;
    const pool = createPool({ files: { urlOf: (id) => `blob:${id}` }, maxVideos: 2, create: () => ((made.video ??= []).push(new FakeMedia()), made.video[n++] as never) });
    pool.acquire({ itemId: 'a', srcId: 'v1', kind: 'video' });
    pool.acquire({ itemId: 'b', srcId: 'v1', kind: 'video' });
    pool.acquire({ itemId: 'a', srcId: 'v1', kind: 'video' }); // a is now newer than b
    pool.acquire({ itemId: 'c', srcId: 'v2', kind: 'video' });
    expect(pool.get('b')).toBeUndefined();
    expect(pool.get('a')).toBeDefined();
    expect(pool.liveVideos()).toBe(2);
    // protected ones are not evicted; with no room the answer is null
    expect(pool.acquire({ itemId: 'd', srcId: 'v1', kind: 'video' }, new Set(['a', 'c']))).toBeNull();
  });

  it('makes one element per item even for the same file', () => {
    project = { ...base(), layers: [media('m', 'v1', 0, 5)] };
    const tr = make();
    tr.seek(1);
    expect(live('v1')).toHaveLength(2);
    tr.dispose();
  });

  it('dispose releases everything and stops the loop', async () => {
    const tr = make();
    await tr.play();
    tr.dispose();
    expect(live('v1')).toHaveLength(0);
    expect(made.video!.every((f) => f.src === '' && f.loadCalls === 1 && f.paused)).toBe(true);
    expect(rafCb).toBeNull();
  });
});


describe('review fixes', () => {
  const fade = { kind: 'fade' as const, duration: 2 };
  // a plays v1 55..60 (file ends at 60), edit 0..5; b starts at source 0.2; cut at 5, window 4..6
  const edge = () => {
    project = {
      ...base(),
      clips: [{ id: 'a', srcId: 'v1', start: 55, end: 60 }, { id: 'b', srcId: 'v2', start: 0.2, end: 5, transitionIn: fade }],
    };
  };

  it('does not restart an outgoing element that ran into the end of its file', async () => {
    edge();
    const tr = make();
    await tr.play();
    clockMs = 4500; // a at 59.5
    frameStep(0);
    const a = one('v1');
    a.currentTime = 60;
    a.paused = true; // the browser paused it at the end
    a.ended = true;
    const plays = a.playCalls;
    const sets = a.sets.length;
    for (const ms of [1100, 100, 100, 100]) frameStep(ms); // 5.6 .. 5.9: wants > 60
    expect(a.playCalls).toBe(plays);
    expect(a.sets.length).toBe(sets);
    tr.dispose();
  });

  it('does not re-seek an incoming element held at 0 every cycle', async () => {
    edge();
    const tr = make();
    await tr.play(); // t=0
    clockMs = 3000;
    frameStep(0); // window opens at 4; upcoming primes
    clockMs = 4000;
    frameStep(0); // b active, wants 0.2-2 -> pinned 0
    const b = one('v2');
    const plays = b.playCalls;
    const sets = b.sets.length;
    for (let i = 0; i < 10; i++) frameStep(50); // 4.05 .. 4.5, still wants < 0
    expect(b.sets.length).toBe(sets);
    expect(b.playCalls).toBe(plays);
    expect(b.paused).toBe(true);
    clockMs = 5000;
    frameStep(0); // wants 0.2: inside the file, starts
    expect(b.playCalls).toBe(plays + 1);
    tr.dispose();
  });

  it('clears a refused (blocked) element when Play is pressed again', async () => {
    const tr = make();
    await tr.play();
    const a = one('v1');
    a.playResult = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    a.paused = true;
    frameStep(16);
    await flush();
    a.playResult = () => Promise.resolve();
    tr.pause();
    const before = a.playCalls;
    await tr.play();
    expect(a.playCalls).toBeGreaterThan(before);
    expect(a.paused).toBe(false);
    tr.dispose();
  });

  it('repaints a paused picture when an element finishes loading, once per animation frame', () => {
    const tr = make();
    tr.seek(1);
    const a = one('v1');
    onFrame.mockClear();
    a.dispatchEvent(new Event('loadeddata'));
    a.dispatchEvent(new Event('canplay'));
    expect(onFrame).not.toHaveBeenCalled(); // coalesced to the next frame
    frameStep(16);
    expect(onFrame).toHaveBeenCalledTimes(1);
    tr.dispose();
  });
});

describe('pool onPicture', () => {
  it('fires on image load/error and media loadeddata/canplay/seeked', () => {
    const onPicture = vi.fn();
    const img = new EventTarget();
    const vid = new FakeMedia();
    const pool = createPool({
      files: { urlOf: (id) => `blob:${id}` },
      onPicture,
      create: (k) => (k === 'image' ? img : vid) as never,
    });
    pool.acquire({ itemId: 'i', srcId: 'im', kind: 'image' });
    pool.acquire({ itemId: 'v', srcId: 'v1', kind: 'video' });
    img.dispatchEvent(new Event('load'));
    img.dispatchEvent(new Event('error'));
    for (const n of ['loadeddata', 'canplay', 'seeked']) vid.dispatchEvent(new Event(n));
    expect(onPicture).toHaveBeenCalledTimes(5);
  });
});
