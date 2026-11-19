import { ease } from './keyframes.ts';

/**
 * In, out and loop animations for text and pictures. Each is a preset and a
 * duration; `animFactors` turns a preset and a progress into plain multipliers
 * and offsets the compositor applies on top of the layer's own values.
 *
 *  - `dx`, `dy`: offsets in units of the layer's own width and height
 *    (-1 = one width to the left / one height up).
 *  - `scale`, `opacity`: multipliers (1 = unchanged).
 *  - `chars`: the share of the text's characters shown, 0..1 (1 = all).
 */

export type AnimPreset = 'none' | 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'pop' | 'typewriter';
export type AnimPhase = 'in' | 'out' | 'loop';

export const PRESETS: readonly AnimPreset[] = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'pop', 'typewriter'];

export const PRESET_LABELS: Record<AnimPreset, string> = {
  none: 'None',
  fade: 'Fade',
  slideLeft: 'Slide from left',
  slideRight: 'Slide from right',
  slideUp: 'Slide from top',
  slideDown: 'Slide from bottom',
  pop: 'Pop',
  typewriter: 'Typewriter',
};

export interface AnimFactors {
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  chars: number;
}

export const IDENTITY: AnimFactors = { dx: 0, dy: 0, scale: 1, opacity: 1, chars: 1 };

/** One slot: the preset and, for in/out, how long it takes; for a loop, how long one cycle takes (seconds). */
export interface AnimSlot {
  preset: AnimPreset;
  dur: number;
}

export interface Anims {
  in?: AnimSlot;
  out?: AnimSlot;
  loop?: AnimSlot;
}

export interface Animated {
  anims?: Anims;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Direction each slide preset comes from (and leaves towards): -1 left/up, +1 right/down. */
const SLIDE: Partial<Record<AnimPreset, { ax: 'dx' | 'dy'; sign: -1 | 1 }>> = {
  slideLeft: { ax: 'dx', sign: -1 },
  slideRight: { ax: 'dx', sign: 1 },
  slideUp: { ax: 'dy', sign: -1 },
  slideDown: { ax: 'dy', sign: 1 },
};

/**
 * `progress` runs 0..1. For 'in' 0 is hidden and 1 settled; for 'out' 0 is
 * settled and 1 gone; for 'loop' it is the position inside one cycle and the
 * result is periodic (the same at 0 and 1).
 */
export function animFactors(preset: AnimPreset, phase: AnimPhase, progress: number): AnimFactors {
  const p = clamp01(progress);
  if (preset === 'none') return { ...IDENTITY };
  if (phase === 'loop') {
    const wave = Math.sin(2 * Math.PI * p);
    const dip = 0.5 - 0.5 * Math.cos(2 * Math.PI * p); // 0 at the ends, 1 in the middle
    const r = { ...IDENTITY };
    if (preset === 'fade') r.opacity = 1 - 0.5 * dip;
    else if (preset === 'pop') r.scale = 1 + 0.1 * wave;
    else if (SLIDE[preset]) r[SLIDE[preset]!.ax] = 0.1 * wave;
    return r;
  }
  const hidden = phase === 'in' ? 1 - p : p; // 1 = fully away, 0 = settled
  const r = { ...IDENTITY };
  if (preset === 'fade') r.opacity = 1 - hidden;
  else if (preset === 'pop') r.scale = 1 - hidden;
  else if (preset === 'typewriter') r.chars = 1 - hidden;
  else if (SLIDE[preset]) r[SLIDE[preset]!.ax] = hidden === 0 ? 0 : SLIDE[preset]!.sign * hidden;
  return r;
}

const combine = (a: AnimFactors, b: AnimFactors): AnimFactors => ({
  dx: a.dx + b.dx,
  dy: a.dy + b.dy,
  scale: a.scale * b.scale,
  opacity: a.opacity * b.opacity,
  chars: a.chars * b.chars,
});

const easeOut = ease('easeOut');
const easeIn = ease('easeIn');

/**
 * What the in, out and loop animations of `layer` do at `tLocal` (seconds from
 * the layer's start) when the layer lasts `duration`. The in and out are eased
 * (out-curve arriving, in-curve leaving); if together they are longer than the
 * layer they are shrunk in proportion.
 */
export function animOf(layer: Animated, tLocal: number, duration: number): AnimFactors {
  const a = layer.anims;
  if (!a) return { ...IDENTITY };
  let inD = a.in && a.in.preset !== 'none' ? Math.max(0, a.in.dur) : 0;
  let outD = a.out && a.out.preset !== 'none' ? Math.max(0, a.out.dur) : 0;
  if (inD + outD > duration && inD + outD > 0) {
    const k = duration / (inD + outD);
    inD *= k;
    outD *= k;
  }
  let r = { ...IDENTITY };
  if (a.in && inD > 0 && tLocal < inD) r = combine(r, animFactors(a.in.preset, 'in', easeOut(tLocal / inD)));
  if (a.out && outD > 0 && tLocal > duration - outD) r = combine(r, animFactors(a.out.preset, 'out', easeIn((tLocal - (duration - outD)) / outD)));
  if (a.loop && a.loop.preset !== 'none' && a.loop.dur > 0) {
    const c = tLocal / a.loop.dur;
    r = combine(r, animFactors(a.loop.preset, 'loop', c - Math.floor(c)));
  }
  return r;
}
