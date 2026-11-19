/**
 * How a piece of text looks, and how it is laid out and drawn on a canvas.
 * Shared by the photo and the video editor, so a style means the same in both.
 */

import { drawEffectLines, effectBounds, type EffectLayout, type TextEffect } from './text-effects.ts';

export type FontKey = 'sans' | 'serif' | 'mono' | 'display' | 'script';

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  sans: { label: 'Clean', css: '"IBM Plex Sans", system-ui, sans-serif' },
  serif: { label: 'Serif', css: '"IBM Plex Serif", Georgia, serif' },
  mono: { label: 'Typewriter', css: '"IBM Plex Mono", ui-monospace, Menlo, monospace' },
  display: { label: 'Bold', css: '"Arial Black", "Helvetica Neue", Arial, sans-serif' },
  script: { label: 'Script', css: '"Brush Script MT", "Segoe Script", cursive' },
};

export interface TextStyle {
  font: FontKey;
  /** Pixels on the image or video frame. */
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  /** Extra space between letters, in pixels. */
  letterSpacing: number;
  /** A multiple of the size. */
  lineHeight: number;
  opacity: number;
  outline: { width: number; color: string } | null;
  shadow: { blur: number; dx: number; dy: number; color: string } | null;
  glow: { blur: number; color: string } | null;
  box: { color: string; padding: number; radius: number } | null;
  /** Optional extra look (hollow, echo, glitch, neon, splice, lift, curve); see text-effects.ts. Absent or 'none': drawn as before. */
  effect?: TextEffect;
}

export const DEFAULT_STYLE: TextStyle = {
  font: 'sans',
  size: 48,
  bold: true,
  italic: false,
  color: '#ffffff',
  align: 'center',
  uppercase: false,
  letterSpacing: 0,
  lineHeight: 1.25,
  opacity: 1,
  outline: { width: 4, color: '#000000' },
  shadow: null,
  glow: null,
  box: null,
};

/** Ready-made looks, in the spirit of a video editor's text presets. */
export const PRESETS: { id: string; label: string; style: Partial<TextStyle> }[] = [
  { id: 'clean', label: 'Clean', style: { font: 'sans', bold: true, color: '#16202f', outline: null, shadow: null, glow: null, box: null, uppercase: false } },
  { id: 'subtitle', label: 'Subtitle', style: { font: 'sans', bold: true, color: '#ffffff', outline: { width: 5, color: '#000000' }, shadow: { blur: 6, dx: 0, dy: 2, color: 'rgba(0,0,0,0.6)' }, glow: null, box: null, uppercase: false } },
  { id: 'pop', label: 'Pop', style: { font: 'display', bold: false, color: '#ffd400', outline: { width: 8, color: '#000000' }, shadow: { blur: 0, dx: 4, dy: 4, color: '#000000' }, glow: null, box: null, uppercase: true, letterSpacing: 1 } },
  { id: 'neon', label: 'Neon', style: { font: 'sans', bold: true, color: '#ffffff', outline: null, shadow: null, glow: { blur: 22, color: '#2de2e6' }, box: null, uppercase: false } },
  { id: 'label', label: 'Label', style: { font: 'sans', bold: true, color: '#ffffff', outline: null, shadow: null, glow: null, box: { color: 'rgba(22,32,47,0.85)', padding: 14, radius: 10 }, uppercase: false } },
  { id: 'highlight', label: 'Highlight', style: { font: 'sans', bold: true, color: '#16202f', outline: null, shadow: null, glow: null, box: { color: '#ffd400', padding: 10, radius: 4 }, uppercase: false } },
  { id: 'typewriter', label: 'Typewriter', style: { font: 'mono', bold: false, color: '#16202f', outline: null, shadow: null, glow: null, box: { color: '#f6f8fa', padding: 12, radius: 2 }, uppercase: false } },
  { id: 'soft', label: 'Soft', style: { font: 'serif', bold: false, italic: true, color: '#ffffff', outline: null, shadow: { blur: 14, dx: 0, dy: 3, color: 'rgba(0,0,0,0.7)' }, glow: null, box: null, uppercase: false } },
  { id: 'script', label: 'Script', style: { font: 'script', bold: false, color: '#ffffff', outline: null, shadow: { blur: 10, dx: 0, dy: 2, color: 'rgba(0,0,0,0.65)' }, glow: null, box: null, uppercase: false, size: 64 } },
];

export const applyPreset = (style: TextStyle, id: string): TextStyle => {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? { ...style, ...preset.style } : style;
};

export const fontString = (s: TextStyle): string => `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${s.size}px ${FONTS[s.font].css}`;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Breaks text at its own newlines, and then at spaces so no line is wider than `maxWidth` (0: no limit). */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (maxWidth <= 0 || measure(para) <= maxWidth) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

type Ctx = Pick<CanvasRenderingContext2D, 'measureText' | 'font'> & { letterSpacing?: string };

export interface Layout {
  lines: string[];
  /** The box, including its padding, with its top-left at (0, 0). */
  width: number;
  height: number;
  pad: number;
  lineH: number;
  /** Only when the style has an active effect: the box then includes the effect's extent. */
  fx?: EffectLayout;
}

export function layoutText(ctx: Ctx, text: string, style: TextStyle, maxWidth: number): Layout {
  ctx.font = fontString(style);
  ctx.letterSpacing = `${style.letterSpacing}px`;
  const shown = style.uppercase ? text.toUpperCase() : text;
  const pad = style.box?.padding ?? 0;
  const lines = wrapLines((s) => ctx.measureText(s).width, shown, maxWidth > 0 ? Math.max(1, maxWidth - 2 * pad) : 0);
  const lineH = style.size * style.lineHeight;
  const inner = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  const fx = style.effect ? effectBounds(ctx, lines, style, inner, lineH) : null;
  if (fx) {
    ctx.letterSpacing = `${style.letterSpacing}px`;
    return { lines, width: fx.width + 2 * pad, height: fx.height + 2 * pad, pad, lineH, fx };
  }
  return { lines, width: inner + 2 * pad, height: lines.length * lineH + 2 * pad, pad, lineH };
}

/** One run of text with the style's own glow, shadow, outline and fill; (lx, cy) is its left end and middle. */
export function drawFace(ctx: CanvasRenderingContext2D, line: string, style: TextStyle, lx: number, cy: number): void {
  if (style.glow) {
    ctx.shadowColor = style.glow.color;
    ctx.shadowBlur = style.glow.blur;
    ctx.fillStyle = style.color;
    ctx.fillText(line, lx, cy);
    ctx.fillText(line, lx, cy);
    ctx.shadowBlur = 0;
  }
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur;
    ctx.shadowOffsetX = style.shadow.dx;
    ctx.shadowOffsetY = style.shadow.dy;
  }
  if (style.outline) {
    ctx.strokeStyle = style.outline.color;
    ctx.lineWidth = style.outline.width;
    ctx.strokeText(line, lx, cy);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = style.color;
  ctx.fillText(line, lx, cy);
}

/** Draws the text with its top-left corner at (x, y); returns the rectangle it covers. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, style: TextStyle, x: number, y: number, maxWidth: number): Rect {
  const L = layoutText(ctx, text, style, maxWidth);
  const w = maxWidth > 0 ? Math.max(L.width, maxWidth) : L.width;
  ctx.save();
  ctx.globalAlpha = style.opacity;
  ctx.font = fontString(style);
  ctx.letterSpacing = `${style.letterSpacing}px`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (style.box) {
    ctx.fillStyle = style.box.color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, L.height, style.box.radius);
    ctx.fill();
  }

  if (L.fx && style.effect) drawEffectLines(ctx, L, style, x, y, w, drawFace);
  else
    L.lines.forEach((line, i) => {
      const cy = y + L.pad + i * L.lineH + L.lineH / 2;
      const lw = ctx.measureText(line).width;
      const inner = w - 2 * L.pad;
      const lx = x + L.pad + (style.align === 'center' ? (inner - lw) / 2 : style.align === 'right' ? inner - lw : 0);
      drawFace(ctx, line, style, lx, cy);
    });
  ctx.restore();
  return { x, y, w, h: L.height };
}
