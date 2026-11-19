import type { Adjust } from '../video/project.ts';

/*
 * One-tap "Auto" for brightness, contrast and saturation from the picture's
 * luma histogram. The idea is the linear contrast stretch (normalisation):
 * IN = (I - Min)/(Max - Min) * (newMax - newMin) + newMin, here with Min and
 * Max taken at the 1st and 99th percentiles so a few stray pixels do not
 * decide (Wikipedia, "Normalization (image processing)"). The ranges, targets
 * and dead-bands below are this project's own conservative choices, not a
 * published standard, and everything is bounded to +-40.
 * Notes: docs/ideas/photo-research-tools.md.
 */

export const MAX_SIDE = 256;
const LIMIT = 40;
const CLIP = 0.01;
/** The stretched picture should span about this much of 0..255. */
const TARGET_RANGE = 235;
/** A range at least this wide is left alone. */
const GOOD_RANGE = 225;
/** A mean luma inside this band is left alone; outside it the mean is moved to the nearer edge (a gentle, continuous correction). */
const MEAN_LOW = 105;
const MEAN_HIGH = 145;
/** Mean chroma (max-min of r,g,b) below which a picture counts as washed out, and the value we steer to. */
const FLAT_CHROMA = 45;
const MIN_CHROMA = 3;

export interface LumaSample {
  /** 256-bin luma histogram of the sampled pixels. */
  hist: Uint32Array;
  count: number;
  meanLuma: number;
  meanChroma: number;
  size: { w: number; h: number };
}

/** Samples every step-th pixel (nearest, no filtering) so that the longer side is at most MAX_SIDE; luma = 0.2126 R + 0.7152 G + 0.0722 B (Rec. 709); alpha-0 pixels are skipped. */
export function downscaleLuma(img: ImageData): LumaSample {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.ceil(Math.max(w, h) / MAX_SIDE));
  const hist = new Uint32Array(256);
  let n = 0;
  let sumL = 0;
  let sumC = 0;
  let sw = 0;
  let sh = 0;
  for (let y = 0; y < h; y += step) {
    sh++;
    sw = 0;
    for (let x = 0; x < w; x += step) {
      sw++;
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[l]!++;
      n++;
      sumL += l;
      sumC += Math.max(r, g, b) - Math.min(r, g, b);
    }
  }
  return { hist, count: n, meanLuma: n ? sumL / n : 0, meanChroma: n ? sumC / n : 0, size: { w: sw, h: sh } };
}

/** The luma at the given cumulative fraction (0..1) of the histogram. */
export function percentile(hist: Uint32Array, count: number, q: number): number {
  const goal = q * count;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= goal && acc > 0) return v;
  }
  return 255;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Brightness, contrast and saturation (in the Adjust scale, whole numbers,
 * within +-40) that bring the picture's tones to a healthy spread:
 *  - contrast: when the 1%..99% luma range is narrower than 225, the slope
 *    that would widen it to about 235 (contrast 1 + c/100); never lowers it.
 *  - brightness: the multiplier (applied before contrast, as the renderer
 *    does) that puts the mean luma at the nearer edge of 105..145 after that
 *    contrast, and does nothing when it is inside that band.
 *  - saturation: only when the mean chroma is between 3 and 45 (washed out
 *    but not grey): raises it towards 45, at most 25.
 */
export function autoEnhance(img: ImageData): Adjust {
  const s = downscaleLuma(img);
  if (!s.count) return {};
  const lo = percentile(s.hist, s.count, CLIP);
  const hi = percentile(s.hist, s.count, 1 - CLIP);
  const range = Math.max(1, hi - lo);

  let con = 1;
  if (range < GOOD_RANGE) con = 1 + clamp((TARGET_RANGE / range - 1) * 100, 0, LIMIT) / 100;

  let bri = 1;
  const target = clamp(s.meanLuma, MEAN_LOW, MEAN_HIGH);
  if (target !== s.meanLuma && s.meanLuma > 0) {
    // mean after brightness b then contrast c: m*b*c + 127.5*(1 - c) = target
    bri = (target - 127.5 * (1 - con)) / (s.meanLuma * con);
  }

  let sat = 0;
  if (s.meanChroma >= MIN_CHROMA && s.meanChroma < FLAT_CHROMA) sat = clamp((FLAT_CHROMA / s.meanChroma - 1) * 40, 0, 25);

  const out: Adjust = {};
  const brightness = Math.round(clamp((bri - 1) * 100, -LIMIT, LIMIT));
  const contrast = Math.round((con - 1) * 100);
  const saturation = Math.round(sat);
  if (brightness) out.brightness = brightness;
  if (contrast) out.contrast = contrast;
  if (saturation) out.saturation = saturation;
  return out;
}
