/**
 * Text effects in the spirit of Canva's Style / Color / Shape groups: hollow,
 * echo, glitch, neon, splice, lift and curve. One effect per text. Sizes are
 * percentages of the font size, so an effect scales with the text (and means
 * the same on a photo and on a video frame). Directions are degrees: 0 is
 * right, 90 is down (canvas y points down).
 *
 * Pure geometry (arcGlyphs, effectMargin, effectBounds) is separate from the
 * drawing (drawEffectLines); text-style.ts calls both only when an effect is
 * set, so text without one is drawn exactly as before.
 *
 * The research behind every canvas call is in docs/ideas/photo-research-text.md.
 */
import type { Layout, TextStyle } from './text-style.ts';

export type TextEffect =
  | { kind: 'none' }
  /** Outline only, no fill. `width`: stroke width, 1..12 % of the size. */
  | { kind: 'hollow'; width: number }
  /** `count` trailing copies; `offset` 1..30 % of the size per copy. */
  | { kind: 'echo'; offset: number; direction: number; color: string; count: 2 | 3 }
  /** Two coloured copies, one each way along `direction`; `offset` 1..15 %. */
  | { kind: 'glitch'; offset: number; direction: number; colorA: string; colorB: string }
  /** Glow in the text colour around a lighter core; `intensity` 0..100. */
  | { kind: 'neon'; intensity: number }
  /** Hollow letters plus an offset outline in `color`; `width` 1..12 %, `offset` 1..30 %. */
  | { kind: 'splice'; width: number; offset: number; direction: number; color: string }
  /** A soft shadow under the text; `intensity` 0..100. */
  | { kind: 'lift'; intensity: number }
  /** Text along an arc; `amount` -100..100 % of a full circle (negative: a valley). */
  | { kind: 'curve'; amount: number };

export type EffectKind = TextEffect['kind'];

export const EFFECT_KINDS: { kind: EffectKind; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'lift', label: 'Lift' },
  { kind: 'hollow', label: 'Hollow' },
  { kind: 'splice', label: 'Splice' },
  { kind: 'echo', label: 'Echo' },
  { kind: 'glitch', label: 'Glitch' },
  { kind: 'neon', label: 'Neon' },
  { kind: 'curve', label: 'Curve' },
];

export const DEFAULT_EFFECTS: { [K in EffectKind]: Extract<TextEffect, { kind: K }> } = {
  none: { kind: 'none' },
  hollow: { kind: 'hollow', width: 3 },
  echo: { kind: 'echo', offset: 8, direction: 45, color: '#ff4d6d', count: 2 },
  glitch: { kind: 'glitch', offset: 4, direction: 0, colorA: '#00e5ff', colorB: '#ff2d95' },
  neon: { kind: 'neon', intensity: 60 },
  splice: { kind: 'splice', width: 3, offset: 8, direction: 45, color: '#ff4d6d' },
  lift: { kind: 'lift', intensity: 50 },
  curve: { kind: 'curve', amount: 40 },
};

/** Whether the effect changes anything; a flat curve does not. */
export const isActive = (e: TextEffect | undefined): e is TextEffect => !!e && e.kind !== 'none' && !(e.kind === 'curve' && e.amount === 0);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clean = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0

// ---------------------------------------------------------------- curve maths

export interface ArcGlyphs {
  /** The glyph centres, relative to the middle of the line at the top (or bottom) of the arc. */
  x: number[];
  y: number[];
  /** Rotation of each glyph, radians, clockwise positive. */
  rot: number[];
}

/**
 * Puts glyphs along a circular arc. The arc is as long as the text, so
 * `amount` percent of a full circle gives the radius `length / (2 pi amount)`:
 * glyph centres keep their distance along the arc, and each glyph turns by the
 * angle it sits at. Positive: an arch (the sides fall away, below the middle);
 * negative: a valley. 0: a straight line. `advances` are the kerned advance
 * widths, `spacing` is the extra letter spacing between neighbours.
 */
export function arcGlyphs(advances: readonly number[], spacing: number, amount: number): ArcGlyphs {
  const n = advances.length;
  const out: ArcGlyphs = { x: new Array<number>(n), y: new Array<number>(n), rot: new Array<number>(n) };
  let total = n > 0 ? spacing * (n - 1) : 0;
  for (const a of advances) total += a;
  const theta = (clamp(Math.abs(amount), 0, 100) / 100) * 2 * Math.PI;
  const sign = amount < 0 ? -1 : 1;
  const r = theta > 1e-9 ? total / theta : 0;
  let start = -total / 2;
  for (let i = 0; i < n; i++) {
    const centre = start + advances[i]! / 2;
    start += advances[i]! + spacing;
    if (r === 0) {
      out.x[i] = centre;
      out.y[i] = 0;
      out.rot[i] = 0;
    } else {
      const phi = centre / r;
      out.x[i] = r * Math.sin(phi);
      out.y[i] = sign * r * (1 - Math.cos(phi));
      out.rot[i] = sign * phi;
    }
  }
  return out;
}

type MeasureCtx = Pick<CanvasRenderingContext2D, 'measureText' | 'font'> & { letterSpacing?: string };

/** The geometry of one line on its arc. y is relative to the line's middle at the apex. */
export interface CurveLine {
  chars: string[];
  adv: number[];
  gx: number[];
  gy: number[];
  rot: number[];
  minX: number;
  maxX: number;
  /** Vertical extent of the line's slot: from `yTop` (<= -lineH / 2) to `yBot` (>= lineH / 2). */
  yTop: number;
  yBot: number;
}

const curveCache = new Map<string, CurveLine>();

/**
 * Measures a line glyph by glyph and lays it on the arc. The advance of a
 * glyph is measure(prefix up to it) - measure(prefix before it), so kerning is
 * kept, and the result is cached (keyed on font, size, spacing, amount, text
 * and the whole line's measured width, so a web font arriving late misses the
 * cache). ctx.font must already be set. Letter spacing is added here by hand
 * (the context's own is switched off while measuring), so it works in
 * browsers without ctx.letterSpacing.
 */
export function curveLine(ctx: MeasureCtx, line: string, style: TextStyle, lineH: number): CurveLine {
  const amount = style.effect?.kind === 'curve' ? style.effect.amount : 0;
  const prevLs = ctx.letterSpacing;
  if (prevLs !== undefined) ctx.letterSpacing = '0px';
  const full = ctx.measureText(line).width;
  const key = `${ctx.font}|${style.letterSpacing}|${amount}|${lineH}|${full}|${line}`;
  let hit = curveCache.get(key);
  if (!hit) {
    const chars = Array.from(line);
    const adv = new Array<number>(chars.length);
    let acc = '';
    let prev = 0;
    for (let i = 0; i < chars.length; i++) {
      acc += chars[i];
      const w = ctx.measureText(acc).width;
      adv[i] = w - prev;
      prev = w;
    }
    const g = arcGlyphs(adv, style.letterSpacing, amount);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < chars.length; i++) {
      // The rotated glyph cell (advance x size) is bounded by this box.
      const s = Math.abs(Math.sin(g.rot[i]!));
      const c = Math.abs(Math.cos(g.rot[i]!));
      const hx = (adv[i]! / 2) * c + (style.size / 2) * s;
      const hy = (adv[i]! / 2) * s + (style.size / 2) * c;
      minX = Math.min(minX, g.x[i]! - hx);
      maxX = Math.max(maxX, g.x[i]! + hx);
      minY = Math.min(minY, g.y[i]! - hy);
      maxY = Math.max(maxY, g.y[i]! + hy);
    }
    if (!chars.length) minX = maxX = minY = maxY = 0;
    hit = { chars, adv, gx: g.x, gy: g.y, rot: g.rot, minX, maxX, yTop: Math.min(minY, -lineH / 2), yBot: Math.max(maxY, lineH / 2) };
    if (curveCache.size >= 64) curveCache.clear();
    curveCache.set(key, hit);
  }
  if (prevLs !== undefined) ctx.letterSpacing = prevLs;
  return hit;
}

// ------------------------------------------------------------ extent / bounds

export interface Margin {
  l: number;
  t: number;
  r: number;
  b: number;
}

const ZERO: Margin = { l: 0, t: 0, r: 0, b: 0 };

const vec = (deg: number, len: number) => ({ x: clean(len * Math.cos((deg * Math.PI) / 180)), y: clean(len * Math.sin((deg * Math.PI) / 180)) });

/** How far the effect's copies reach beyond the text's own box on each side, in pixels. Glow and stroke widths are not counted, as for the existing outline and glow. */
export function effectMargin(e: TextEffect, size: number): Margin {
  switch (e.kind) {
    case 'echo': {
      const v = vec(e.direction, (size * e.offset * e.count) / 100);
      return { l: clean(Math.max(0, -v.x)), t: clean(Math.max(0, -v.y)), r: clean(Math.max(0, v.x)), b: clean(Math.max(0, v.y)) };
    }
    case 'glitch': {
      const v = vec(e.direction, (size * e.offset) / 100);
      return { l: clean(Math.abs(v.x)), t: clean(Math.abs(v.y)), r: clean(Math.abs(v.x)), b: clean(Math.abs(v.y)) };
    }
    case 'splice': {
      const v = vec(e.direction, (size * e.offset) / 100);
      return { l: clean(Math.max(0, -v.x)), t: clean(Math.max(0, -v.y)), r: clean(Math.max(0, v.x)), b: clean(Math.max(0, v.y)) };
    }
    default:
      return ZERO;
  }
}

export interface EffectLayout {
  /** The text block including the effect's extent (without the box padding). */
  width: number;
  height: number;
  /** Where the plain text block starts inside it. */
  inset: { x: number; y: number };
  /** The width added to the widest line (left plus right margin); 0 for a curve. */
  extraW: number;
}

/**
 * The size of the text block once the effect is counted: an echo, glitch or
 * splice grows it by their offset (the text moves inside so the top-left corner
 * stays the layer's position), a curve makes it the extent of the arc. Null
 * when there is no active effect. `inner` is the widest line's width. ctx.font
 * must be set.
 */
export function effectBounds(ctx: MeasureCtx, lines: readonly string[], style: TextStyle, inner: number, lineH: number): EffectLayout | null {
  const e = style.effect;
  if (!isActive(e)) return null;
  if (e.kind === 'curve') {
    let width = 0;
    let height = 0;
    for (const line of lines) {
      const c = curveLine(ctx, line, style, lineH);
      width = Math.max(width, c.maxX - c.minX);
      height += c.yBot - c.yTop;
    }
    return { width, height, inset: { x: 0, y: 0 }, extraW: 0 };
  }
  const m = effectMargin(e, style.size);
  return { width: inner + m.l + m.r, height: lines.length * lineH + m.t + m.b, inset: { x: m.l, y: m.t }, extraW: m.l + m.r };
}

// -------------------------------------------------------------------- drawing

/** What the effect draws the plain face with (the existing outline/shadow/glow/fill path). */
export type FaceFn = (ctx: CanvasRenderingContext2D, line: string, style: TextStyle, x: number, y: number) => void;

const clearShadow = (ctx: CanvasRenderingContext2D) => {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

const lightCache = new Map<string, string>();
/** The colour mixed 70 % toward white, for the core of neon text. Anything but #rgb / #rrggbb gives white. */
export function lighten(color: string): string {
  let hit = lightCache.get(color);
  if (hit === undefined) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (!m) hit = '#ffffff';
    else {
      const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
      const ch = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.3 + 255 * 0.7));
      hit = `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    if (lightCache.size > 200) lightCache.clear();
    lightCache.set(color, hit);
  }
  return hit;
}

const liftColors: string[] = [];
const liftColor = (intensity: number): string => {
  const i = Math.round(clamp(intensity, 0, 100));
  return (liftColors[i] ??= `rgba(0,0,0,${(0.15 + 0.35 * (i / 100)).toFixed(3)})`);
};

/** Draws one straight line of text with the effect; (x, cy) is the line's left end and middle. */
function paintLine(ctx: CanvasRenderingContext2D, line: string, style: TextStyle, x: number, cy: number, face: FaceFn): void {
  const e = style.effect!;
  const size = style.size;
  switch (e.kind) {
    case 'hollow':
      ctx.strokeStyle = style.color;
      ctx.lineWidth = (size * e.width) / 100;
      ctx.strokeText(line, x, cy);
      return;
    case 'echo': {
      const step = vec(e.direction, (size * e.offset) / 100);
      const alpha = ctx.globalAlpha;
      ctx.fillStyle = e.color;
      for (let k = e.count; k >= 1; k--) {
        ctx.globalAlpha = alpha * (1 - k / (e.count + 1));
        ctx.fillText(line, x + step.x * k, cy + step.y * k);
      }
      ctx.globalAlpha = alpha;
      face(ctx, line, style, x, cy);
      return;
    }
    case 'glitch': {
      const v = vec(e.direction, (size * e.offset) / 100);
      ctx.fillStyle = e.colorA;
      ctx.fillText(line, x + v.x, cy + v.y);
      ctx.fillStyle = e.colorB;
      ctx.fillText(line, x - v.x, cy - v.y);
      ctx.fillStyle = style.color;
      ctx.fillText(line, x, cy);
      return;
    }
    case 'neon': {
      const blur = (size * 0.8 * clamp(e.intensity, 0, 100)) / 100;
      ctx.shadowColor = style.color;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = style.color;
      ctx.shadowBlur = blur * 0.15;
      ctx.fillText(line, x, cy);
      ctx.shadowBlur = blur * 0.4;
      ctx.fillText(line, x, cy);
      ctx.shadowBlur = blur;
      ctx.fillText(line, x, cy);
      clearShadow(ctx);
      ctx.fillStyle = lighten(style.color);
      ctx.fillText(line, x, cy);
      return;
    }
    case 'splice': {
      const v = vec(e.direction, (size * e.offset) / 100);
      ctx.lineWidth = (size * e.width) / 100;
      ctx.strokeStyle = e.color;
      ctx.strokeText(line, x + v.x, cy + v.y);
      ctx.strokeStyle = style.color;
      ctx.strokeText(line, x, cy);
      return;
    }
    case 'lift': {
      const i = clamp(e.intensity, 0, 100) / 100;
      ctx.shadowColor = liftColor(e.intensity);
      ctx.shadowBlur = size * (0.12 + 0.35 * i);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = size * (0.04 + 0.1 * i);
      ctx.fillStyle = style.color;
      ctx.fillText(line, x, cy);
      clearShadow(ctx);
      return;
    }
    default:
      face(ctx, line, style, x, cy);
  }
}

/**
 * Draws every line of a laid-out block with the effect, after the box has been
 * drawn. (x, y) is the block's top-left, `w` its full width (>= L.width);
 * ctx must already have the font, baseline and join set, as in drawText.
 */
export function drawEffectLines(ctx: CanvasRenderingContext2D, L: Layout, style: TextStyle, x: number, y: number, w: number, face: FaceFn): void {
  const fx = L.fx!;
  const e = style.effect!;
  const inner = w - 2 * L.pad;
  if (e.kind === 'curve') {
    ctx.letterSpacing = '0px'; // glyph spacing is applied by arcGlyphs
    let top = y + L.pad;
    for (const line of L.lines) {
      const c = curveLine(ctx, line, style, L.lineH);
      const ax = style.align === 'center' ? x + L.pad + inner / 2 - (c.minX + c.maxX) / 2 : style.align === 'right' ? x + L.pad + inner - c.maxX : x + L.pad - c.minX;
      const cy = top - c.yTop;
      for (let i = 0; i < c.chars.length; i++) {
        ctx.save();
        ctx.translate(ax + c.gx[i]!, cy + c.gy[i]!);
        ctx.rotate(c.rot[i]!);
        face(ctx, c.chars[i]!, style, -c.adv[i]! / 2, 0);
        ctx.restore();
      }
      top += c.yBot - c.yTop;
    }
    return;
  }
  const avail = inner - fx.extraW;
  L.lines.forEach((line, i) => {
    const cy = y + L.pad + fx.inset.y + i * L.lineH + L.lineH / 2;
    const lw = ctx.measureText(line).width;
    const lx = x + L.pad + fx.inset.x + (style.align === 'center' ? (avail - lw) / 2 : style.align === 'right' ? avail - lw : 0);
    paintLine(ctx, line, style, lx, cy, face);
  });
}
