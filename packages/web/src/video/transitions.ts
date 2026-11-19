import type { Clip } from './timeline.ts';
import { length, startOf } from './timeline.ts';

/**
 * Transitions between two clips of the main track. The model, in one line:
 * a transition belongs to the clip AFTER the join (`clip.transitionIn`), is
 * CENTRED on the cut, and is as long as `duration` on the edit's clock - half
 * before the cut, half after. The clips do not move, so `length`, `startOf`,
 * `total` and `locate` are untouched. While it runs both clips play (the
 * outgoing one past its out-point, the incoming one before its in-point, using
 * the source's spare footage when there is some). docs/ideas/video-research-transitions.md
 * gives the reasons and the sources.
 */

export type TransitionKind =
  | 'fade'
  | 'dip'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'push-left'
  | 'push-right'
  | 'wipe-left'
  | 'wipe-right'
  | 'zoom';

export interface Transition {
  kind: TransitionKind;
  /** Seconds on the edit's clock. */
  duration: number;
}

/** Name shown to people, in menu order. The direction words say where the NEW picture comes from (slide-left: from the right, moving left). */
export const TRANSITION_KINDS: { kind: TransitionKind; label: string }[] = [
  { kind: 'fade', label: 'Dissolve' },
  { kind: 'dip', label: 'Dip to black' },
  { kind: 'slide-left', label: 'Slide left' },
  { kind: 'slide-right', label: 'Slide right' },
  { kind: 'slide-up', label: 'Slide up' },
  { kind: 'slide-down', label: 'Slide down' },
  { kind: 'push-left', label: 'Push left' },
  { kind: 'push-right', label: 'Push right' },
  { kind: 'wipe-left', label: 'Wipe left' },
  { kind: 'wipe-right', label: 'Wipe right' },
  { kind: 'zoom', label: 'Zoom' },
];

export const labelOf = (kind: TransitionKind): string => TRANSITION_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** Shorter than this is a cut, not a transition. */
export const MIN_TRANSITION = 0.1;
/** What a new transition starts at (a common default, not a measured one). */
export const DEFAULT_TRANSITION = 0.5;

/**
 * The longest transition the join before clip `index` can have: half the
 * shorter of the two clips (the rule third-party CapCut guides give). 0 for
 * the first clip, which has no join before it.
 */
export function maxDuration(clips: Clip[], index: number): number {
  const a = clips[index - 1];
  const b = clips[index];
  if (index < 1 || !a || !b) return 0;
  return Math.min(length(a), length(b)) / 2;
}

/** The duration that actually plays: the stored one clamped to `maxDuration`; 0 when there is none or the clips are too short for MIN_TRANSITION. */
export function effectiveDuration(clips: Clip[], index: number): number {
  const t = clips[index]?.transitionIn;
  if (!t || index < 1) return 0;
  const d = Math.min(t.duration, maxDuration(clips, index));
  return d >= MIN_TRANSITION - 1e-9 ? d : 0;
}

export interface TransitionState {
  fromIndex: number;
  toIndex: number;
  /** 0 at the start of the window, 0.5 at the cut, approaching 1 at its end. Linear in time; `drawTransition` applies the easing. */
  progress: number;
  kind: TransitionKind;
}

/** The transition running at edit time `t`, or null. The window is [cut - d/2, cut + d/2): at its end the incoming clip is alone. */
export function transitionAt(clips: Clip[], t: number): TransitionState | null {
  for (let i = 1; i < clips.length; i++) {
    const d = effectiveDuration(clips, i);
    if (d <= 0) continue;
    const cut = startOf(clips, i);
    const from = cut - d / 2;
    if (t >= from && t < cut + d / 2) return { fromIndex: i - 1, toIndex: i, progress: Math.min(Math.max((t - from) / d, 0), 1), kind: clips[i]!.transitionIn!.kind };
  }
  return null;
}

/** Edit time at which the incoming clip of the join before `index` has to be playing (the start of the window), or its start when there is no transition. */
export const windowStart = (clips: Clip[], index: number): number => startOf(clips, index) - effectiveDuration(clips, index) / 2;

/** Ease in and out (the cubic ease-in-out formula); input clamped to 0..1. */
export function easeInOut(p: number): number {
  const x = Math.min(Math.max(p, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

type Draw = (ctx: CanvasRenderingContext2D) => void;

/**
 * Draws the two pictures of a transition at `progress` (0..1, clamped).
 * `drawFrom` and `drawTo` each draw their whole picture for the full frame
 * with the context as it is given; they must respect `ctx.globalAlpha` (multiply
 * their own opacity into it, do not assign over it). The context's state is
 * restored on return.
 */
export function drawTransition(ctx: CanvasRenderingContext2D, kind: TransitionKind, progress: number, size: { w: number; h: number }, drawFrom: Draw, drawTo: Draw): void {
  const p = Math.min(Math.max(progress, 0), 1);
  const e = easeInOut(p);
  const { w, h } = size;
  const base = ctx.globalAlpha;
  const part = (fn: Draw, f: () => void = () => {}) => {
    ctx.save();
    f();
    fn(ctx);
    ctx.restore();
  };
  const alpha = (a: number) => () => {
    ctx.globalAlpha = base * a;
  };
  const shift = (dx: number, dy: number) => () => ctx.translate(dx, dy);

  switch (kind) {
    case 'fade':
      part(drawFrom);
      part(drawTo, alpha(p));
      return;
    case 'dip':
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      if (p < 0.5) part(drawFrom, alpha(1 - 2 * p));
      else part(drawTo, alpha(2 * p - 1));
      return;
    case 'slide-left':
      part(drawFrom);
      part(drawTo, shift(w * (1 - e), 0));
      return;
    case 'slide-right':
      part(drawFrom);
      part(drawTo, shift(-w * (1 - e), 0));
      return;
    case 'slide-up':
      part(drawFrom);
      part(drawTo, shift(0, h * (1 - e)));
      return;
    case 'slide-down':
      part(drawFrom);
      part(drawTo, shift(0, -h * (1 - e)));
      return;
    case 'push-left':
      part(drawFrom, shift(-w * e, 0));
      part(drawTo, shift(w * (1 - e), 0));
      return;
    case 'push-right':
      part(drawFrom, shift(w * e, 0));
      part(drawTo, shift(-w * (1 - e), 0));
      return;
    case 'wipe-left':
    case 'wipe-right': {
      part(drawFrom);
      const x = kind === 'wipe-left' ? w * (1 - e) : 0;
      part(drawTo, () => {
        ctx.beginPath();
        ctx.rect(x, 0, w * e, h);
        ctx.clip();
      });
      return;
    }
    case 'zoom': {
      const s = 1 + 0.5 * e;
      part(drawFrom, () => {
        ctx.translate(w / 2, h / 2);
        ctx.scale(s, s);
        ctx.translate(-w / 2, -h / 2);
      });
      part(drawTo, alpha(p));
      return;
    }
  }
}
