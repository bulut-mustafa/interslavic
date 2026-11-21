import { describe, expect, it } from 'vitest';
import { createLiveClock } from '../src/video/live-clock.ts';
import { perfBump, perfTake } from '../src/video/perf.ts';
import { emptyProject, type VideoProject } from '../src/video/project.ts';
import { GENTLE_DRIFT, GENTLE_GAP_MS, createTransportWith } from '../src/video/transport.ts';
import { previewScale } from '../src/phone/video/preview-math.ts';
import { removeClip } from '../src/video/timeline.ts';

class FakeVideo extends EventTarget {
  src = '';
  paused = true;
  ended = false;
  readyState = 4;
  volume = 1;
  playbackRate = 1;
  preservesPitch = false;
  preload = '';
  playsInline = false;
  sets: number[] = [];
  private t = 0;
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    this.sets.push(v);
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute() {
    this.src = '';
  }
}

const project = (): VideoProject => ({
  ...emptyProject(),
  sources: [{ id: 'v1', kind: 'video', name: '1', duration: 600 }],
  clips: [{ id: 'a', srcId: 'v1', start: 0, end: 600 }],
});

function setup(gentle: boolean) {
  let ms = 0;
  let cb: (() => void) | null = null;
  const els: FakeVideo[] = [];
  const p = project();
  const tr = createTransportWith(
    { getProject: () => p, files: { urlOf: (id) => `blob:${id}` }, hooks: { onFrame: () => {}, onEnded: () => {} }, gentle },
    { now: () => ms, raf: (f) => ((cb = f), 1), caf: () => (cb = null), create: () => { const e = new FakeVideo(); els.push(e); return e as never; } },
  );
  const step = (d: number) => {
    ms += d;
    const f = cb;
    cb = null;
    f?.();
  };
  return { tr, els, step };
}

describe('gentle transport (phone preview)', () => {
  it('does not chase a drift the desktop would, and corrects a real one at most once a second', async () => {
    const g = setup(true);
    await g.tr.play();
    await new Promise<void>((r) => setTimeout(r, 0)); // the first seek settles
    const el = g.els[0]!;
    el.sets.length = 0;
    el.currentTime = 0; // element stuck while the edit clock runs
    el.sets.length = 0;
    g.step(300); // 0.3 s behind: over the desktop limit (0.15), under GENTLE_DRIFT
    expect(el.sets).toEqual([]);
    g.step(200); // 0.5 s behind: a real drift, corrected
    expect(el.sets.length).toBe(1);
    el.currentTime = 0; // stuck again straight away
    el.sets.length = 0;
    await new Promise<void>((r) => setTimeout(r, 0));
    g.step(300);
    expect(el.sets).toEqual([]); // inside the one-second gap: no second seek
    g.step(GENTLE_GAP_MS);
    expect(el.sets.length).toBe(1);
    expect(GENTLE_DRIFT).toBeGreaterThan(0.15);
    g.tr.dispose();
  });

  it('the desktop transport still corrects at 0.15 s with no gap', async () => {
    const d = setup(false);
    await d.tr.play();
    await new Promise<void>((r) => setTimeout(r, 0));
    const el = d.els[0]!;
    el.currentTime = 0;
    el.sets.length = 0;
    d.step(300);
    expect(el.sets.length).toBe(1);
    d.tr.dispose();
  });
});

describe('live clock', () => {
  it('tells every watcher the new time, and stops after unsubscribe', () => {
    const c = createLiveClock();
    const seen: number[] = [];
    const off = c.subscribe((t) => seen.push(t));
    c.set(1.5);
    off();
    c.set(2);
    expect(seen).toEqual([1.5]);
    expect(c.get()).toBe(2);
  });
});

describe('preview scale', () => {
  it('draws about as many pixels as the screen shows, never more than the frame', () => {
    expect(previewScale(1280, 390, 3)).toBeCloseTo(780 / 1280); // two canvas pixels per CSS pixel, not three
    expect(previewScale(720, 1200, 2)).toBe(1);
    expect(previewScale(1280, 0, 2)).toBe(1);
    expect(previewScale(4000, 300, 1)).toBeGreaterThanOrEqual(0.25);
  });
});

describe('perf counters', () => {
  it('counts and resets', () => {
    perfTake();
    perfBump('x');
    perfBump('x');
    expect(perfTake().x).toBe(2);
    expect(perfTake().x).toBe(0);
  });
});

describe('deleting a clip', () => {
  it('ripples: the clips after it close the gap, and the last clip cannot go', () => {
    const clips = [
      { id: 'a', srcId: 'v1', start: 0, end: 2 },
      { id: 'b', srcId: 'v1', start: 2, end: 5 },
      { id: 'c', srcId: 'v1', start: 5, end: 6 },
    ];
    expect(removeClip(clips, 1).map((c) => c.id)).toEqual(['a', 'c']);
    expect(removeClip([clips[0]!], 0)).toHaveLength(1);
  });
});
