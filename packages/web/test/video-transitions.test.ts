import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSITION, MIN_TRANSITION, TRANSITION_KINDS, drawTransition, easeInOut, effectiveDuration, maxDuration, transitionAt, type TransitionKind } from '../src/video/transitions.ts';
import type { Clip } from '../src/video/timeline.ts';

const clips = (d = 1): Clip[] => [
  { id: 'a', start: 0, end: 10 },
  { id: 'b', start: 0, end: 6, transitionIn: { kind: 'fade', duration: d } },
  { id: 'c', start: 0, end: 4 },
];

describe('maxDuration', () => {
  it('is half the shorter of the two clips around the join', () => {
    expect(maxDuration(clips(), 1)).toBe(3);
    expect(maxDuration(clips(), 2)).toBe(2);
  });
  it('is 0 for the first clip and for indexes that do not exist', () => {
    expect(maxDuration(clips(), 0)).toBe(0);
    expect(maxDuration(clips(), 9)).toBe(0);
  });
  it('uses the clip length on the edit clock, so speed counts', () => {
    const c: Clip[] = [{ id: 'a', start: 0, end: 10, speed: 2 }, { id: 'b', start: 0, end: 10 }];
    expect(maxDuration(c, 1)).toBe(2.5);
  });
});

describe('effectiveDuration', () => {
  it('is the stored duration, clamped to the maximum', () => {
    expect(effectiveDuration(clips(1), 1)).toBe(1);
    expect(effectiveDuration(clips(99), 1)).toBe(3);
  });
  it('is 0 without a transition, on the first clip, or when the clips are too short', () => {
    expect(effectiveDuration(clips(), 2)).toBe(0);
    expect(effectiveDuration([{ id: 'a', start: 0, end: 5, transitionIn: { kind: 'fade', duration: 1 } }], 0)).toBe(0);
    const tiny: Clip[] = [{ id: 'a', start: 0, end: 0.15 }, { id: 'b', start: 0, end: 5, transitionIn: { kind: 'fade', duration: 1 } }];
    expect(effectiveDuration(tiny, 1)).toBe(0);
  });
});

describe('transitionAt', () => {
  // the join between a and b is at 10; a 1 s transition spans 9.5 .. 10.5
  it('is null away from a join', () => {
    expect(transitionAt(clips(1), 5)).toBeNull();
    expect(transitionAt(clips(1), 9.49)).toBeNull();
    expect(transitionAt(clips(1), 10.6)).toBeNull();
    expect(transitionAt([], 1)).toBeNull();
  });
  it('is centred on the cut: progress 0 at the start of the window, 0.5 at the cut', () => {
    const s = transitionAt(clips(1), 9.5)!;
    expect(s).toMatchObject({ fromIndex: 0, toIndex: 1, kind: 'fade' });
    expect(s.progress).toBeCloseTo(0, 9);
    expect(transitionAt(clips(1), 10)!.progress).toBeCloseTo(0.5, 9);
    expect(transitionAt(clips(1), 10.25)!.progress).toBeCloseTo(0.75, 9);
  });
  it('has ended at the end of the window (progress 1 is the incoming clip alone)', () => {
    expect(transitionAt(clips(1), 10.5)).toBeNull();
    expect(transitionAt(clips(1), 10.499)!.progress).toBeCloseTo(0.999, 6);
  });
  it('clamps a too-long duration to the clips', () => {
    // max is 3, so the window is 8.5 .. 11.5
    expect(transitionAt(clips(99), 8.6)).not.toBeNull();
    expect(transitionAt(clips(99), 8.4)).toBeNull();
  });
  it('finds the second join too', () => {
    const c = clips(1);
    c[2] = { ...c[2]!, transitionIn: { kind: 'wipe-left', duration: 2 } };
    // join at 16, window 15 .. 17
    expect(transitionAt(c, 16)).toMatchObject({ fromIndex: 1, toIndex: 2, kind: 'wipe-left' });
  });
  it('ignores a transition on the first clip', () => {
    const c: Clip[] = [{ id: 'a', start: 0, end: 5, transitionIn: { kind: 'fade', duration: 1 } }, { id: 'b', start: 0, end: 5 }];
    expect(transitionAt(c, 0.1)).toBeNull();
  });
});

describe('easeInOut', () => {
  it('runs 0 to 1 and is 0.5 in the middle, clamping outside', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(7)).toBe(1);
  });
});

/** A context that records what is drawn and the state at that moment. */
function fakeCtx() {
  const log: string[] = [];
  const st = { alpha: 1, tx: 0, ty: 0, sx: 1, sy: 1, clip: null as number[] | null };
  const stack: (typeof st)[] = [];
  const ctx = {
    get globalAlpha() { return st.alpha; },
    set globalAlpha(v: number) { st.alpha = v; },
    fillStyle: '',
    save: () => stack.push({ ...st }),
    restore: () => Object.assign(st, stack.pop()),
    translate: (x: number, y: number) => { st.tx += x * st.sx; st.ty += y * st.sy; },
    scale: (x: number, y: number) => { st.sx *= x; st.sy *= y; },
    beginPath: () => {},
    rect: (x: number, y: number, w: number, h: number) => { st.clip = [x + st.tx, y + st.ty, w, h]; },
    clip: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => log.push(`fill ${ctx.fillStyle} ${x},${y},${w},${h} a=${st.alpha}`),
  };
  const draw = (name: string) => () => log.push(`${name} a=${+st.alpha.toFixed(3)} t=${+st.tx.toFixed(3)},${+st.ty.toFixed(3)} s=${+st.sx.toFixed(3)} clip=${st.clip?.map((n) => +n.toFixed(3)).join(',') ?? '-'}`);
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, from: draw('from'), to: draw('to') };
}
const size = { w: 100, h: 50 };
const run = (kind: TransitionKind, p: number) => {
  const f = fakeCtx();
  drawTransition(f.ctx, kind, p, size, f.from, f.to);
  return f.log;
};

describe('drawTransition', () => {
  it('knows its kinds', () => {
    expect(TRANSITION_KINDS.map((k) => k.kind)).toEqual(expect.arrayContaining(['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe-left', 'wipe-right', 'push-left', 'push-right', 'zoom', 'dip']));
    expect(MIN_TRANSITION).toBeGreaterThan(0);
    expect(DEFAULT_TRANSITION).toBeGreaterThanOrEqual(MIN_TRANSITION);
  });
  it.each(TRANSITION_KINDS.map((k) => k.kind))('%s shows only the outgoing picture at 0 and only the incoming at 1', (kind) => {
    const a = run(kind, 0);
    expect(a.some((l) => l.startsWith('from'))).toBe(true);
    // at 0 the incoming picture is invisible, empty-clipped or fully off the frame
    expect(a.filter((l) => l.startsWith('to')).every((l) => /a=0 |clip=\S*,0,\d+|t=-?100,0|t=0,-?50/.test(l))).toBe(true);
    const b = run(kind, 1);
    expect(b.some((l) => /^to a=1 t=0,0 s=1 clip=(-|0,0,100,50)$/.test(l))).toBe(true);
  });
  it('fade: the incoming picture is drawn over the outgoing at alpha = progress', () => {
    expect(run('fade', 0.25)).toEqual(['from a=1 t=0,0 s=1 clip=-', 'to a=0.25 t=0,0 s=1 clip=-']);
  });
  it('dip: out to black in the first half, in from black in the second', () => {
    expect(run('dip', 0.25)).toEqual(['fill #000 0,0,100,50 a=1', 'from a=0.5 t=0,0 s=1 clip=-']);
    expect(run('dip', 0.75)).toEqual(['fill #000 0,0,100,50 a=1', 'to a=0.5 t=0,0 s=1 clip=-']);
  });
  it('slide-left: the incoming picture comes in over the outgoing from the right (eased)', () => {
    const e = easeInOut(0.25);
    const log = run('slide-left', 0.25);
    expect(log[0]).toBe('from a=1 t=0,0 s=1 clip=-');
    expect(log[1]).toBe(`to a=1 t=${+(100 * (1 - e)).toFixed(3)},0 s=1 clip=-`);
  });
  it('slide-up moves along y', () => {
    expect(run('slide-up', 0.5)[1]).toBe('to a=1 t=0,25 s=1 clip=-');
  });
  it('push-left: both pictures move together', () => {
    expect(run('push-left', 0.5)).toEqual(['from a=1 t=-50,0 s=1 clip=-', 'to a=1 t=50,0 s=1 clip=-']);
  });
  it('wipe-left reveals the incoming picture from the right edge with a clip', () => {
    expect(run('wipe-left', 0.5)).toEqual(['from a=1 t=0,0 s=1 clip=-', 'to a=1 t=0,0 s=1 clip=50,0,50,50']);
  });
  it('wipe-right reveals from the left edge', () => {
    expect(run('wipe-right', 0.5)[1]).toContain('clip=0,0,50,50');
  });
  it('zoom: the outgoing picture grows about the centre while the incoming one fades in', () => {
    const log = run('zoom', 1);
    expect(log[0]).toMatch(/^from a=1 .* s=1\.5 /);
    expect(log[1]).toBe('to a=1 t=0,0 s=1 clip=-');
  });
  it('clamps progress outside 0..1 and leaves the context state as it found it', () => {
    expect(run('fade', -1)).toEqual(run('fade', 0));
    expect(run('fade', 9)).toEqual(run('fade', 1));
    const f = fakeCtx();
    drawTransition(f.ctx, 'push-left', 0.3, size, f.from, f.to);
    expect((f.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
  });
});
