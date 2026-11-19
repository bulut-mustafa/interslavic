import type { Adjust } from '../video/project.ts';
import { applyAdjustPixels, type FxAdjust } from '../video/effects.ts';

/*
 * Named looks for the picture. Every look is an Adjust, i.e. only fields the
 * renderer already supports (see FxAdjust in video/effects.ts), so the preview,
 * the thumbnails and the export all run the very same pixel code.
 *
 * Not offered, because it cannot be written with those fields exactly: a true
 * sepia matrix (W3C Filter Effects: sepia() is a fixed 3x3 matrix) and a
 * duotone gradient map. "Sepia" below is the closest the supported fields
 * come (grey, then a warm white balance) and is named for what it looks like.
 */

export interface Preset {
  id: string;
  label: string;
  adjust: Adjust;
}

export const PRESETS: readonly Preset[] = [
  { id: 'vivid', label: 'Vivid', adjust: { saturation: 35, contrast: 12 } },
  { id: 'warm', label: 'Warm', adjust: { temperature: 35, saturation: 8 } },
  { id: 'cool', label: 'Cool', adjust: { temperature: -35, saturation: 5 } },
  { id: 'golden', label: 'Golden', adjust: { temperature: 50, brightness: 8, saturation: 15, fade: 8 } },
  { id: 'mono', label: 'Mono', adjust: { saturation: -100 } },
  { id: 'noir', label: 'Noir', adjust: { saturation: -100, contrast: 35, brightness: -8, vignette: 35 } },
  { id: 'fade', label: 'Fade', adjust: { fade: 35, contrast: -10, saturation: -15 } },
  { id: 'matte', label: 'Matte', adjust: { fade: 40, contrast: -5, saturation: -10 } },
  { id: 'sepia', label: 'Sepia', adjust: { saturation: -100, temperature: 100 } },
  { id: 'vintage', label: 'Vintage', adjust: { temperature: 25, fade: 30, saturation: -20, vignette: 25, contrast: -5 } },
  { id: 'dramatic', label: 'Dramatic', adjust: { contrast: 30, saturation: -15, vignette: 40, brightness: -6 } },
  { id: 'soft', label: 'Soft', adjust: { contrast: -15, brightness: 6, fade: 12, saturation: -5 } },
  { id: 'crisp', label: 'Crisp', adjust: { sharpen: 50, contrast: 12, saturation: 10 } },
  { id: 'bright', label: 'Bright', adjust: { brightness: 15, contrast: 5, saturation: 8 } },
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : Number.isFinite(n) ? n : 1);

/** The look scaled from neutral by `amount` (0..1, clamped): every field is multiplied by it. Unknown id or amount 0 gives {}. */
export function presetAdjust(id: string | undefined, amount = 1): Adjust {
  const p = PRESETS.find((x) => x.id === id);
  const t = clamp01(amount);
  if (!p || t === 0) return {};
  const out: Adjust = {};
  for (const [k, v] of Object.entries(p.adjust)) out[k as keyof Adjust] = Math.round(v * t * 100) / 100;
  return out;
}

/**
 * The preset and an adjustment as ONE Adjust, field by field added. This is an
 * approximation of "preset first, then adjust" (the stages are not exactly
 * additive); the renderer should run presetAdjust first and adjust second for
 * exactness. Use this for a single summary or a single filter string only.
 */
export function applyPreset(adjust: Adjust | undefined, id: string | undefined, amount = 1): Adjust {
  const out: Adjust = { ...adjust };
  for (const [k, v] of Object.entries(presetAdjust(id, amount))) out[k as keyof Adjust] = (out[k as keyof Adjust] ?? 0) + v;
  return out;
}

/** Runs the look over the pixels in place with the shared adjustment code (blur is not used by any look). */
export function applyPresetPixels(img: ImageData, id: string, amount = 1): void {
  const a = presetAdjust(id, amount) as FxAdjust;
  if (Object.keys(a).length) applyAdjustPixels(img, a);
}

/** A small canvas of `source` (cover-fitted square of `size` px) with the look applied, or null where canvas is unavailable. */
export function presetThumb(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap, id: string | undefined, size: number, amount = 1): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const sw = (source as { width: number }).width;
  const sh = (source as { height: number }).height;
  if (!sw || !sh) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const s = Math.min(sw, sh);
  ctx.drawImage(source, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, size, size);
  if (id) {
    const img = ctx.getImageData(0, 0, size, size);
    applyPresetPixels(img, id, amount);
    ctx.putImageData(img, 0, 0);
  }
  return c;
}
