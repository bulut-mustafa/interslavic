import { DEFAULT_STYLE, type Rect } from '../editor/text-style.ts';
import { newLayer, type TextLayer } from '../editor/layers.ts';
import type { OcrLine } from './ocr.ts';
import { isReadableLine } from './readable.ts';

/** 0 (black) to 1 (white), from an "rgb(r, g, b)" string. */
export function luminance(rgb: string): number {
  const m = rgb.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return 1;
  return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
}

const LINE_HEIGHT = 1.15;
/** Tesseract's line box includes the room above and below the letters; the type inside is smaller. */
const SIZE_OF_BOX = 0.78;

/**
 * One text layer for each line the reader found, sitting exactly where the line
 * was, as large as the line was, in a colour that shows on what is behind it -
 * and an erase patch that covers the original lettering. Lines the reader is
 * unsure of, that hold no letters, or that are only what the reader makes of texture (see readable.ts), are left alone and counted.
 */
export interface FitOptions {
  /** The lettering's own colour inside a box, given the background colour; null if it cannot tell. */
  inkOf?: (rect: Rect, background: string) => string | null;
  /** How wide `text` is at `size`, in the font the layer will use. Lets the size be fitted to the line's width. */
  widthAt?: (text: string, size: number) => number;
}

export function layersFromLines(
  lines: OcrLine[],
  ringColorOf: (rect: Rect) => string,
  minConfidence = 40,
  fit: FitOptions = {},
): { layers: TextLayer[]; skipped: number } {
  const layers: TextLayer[] = [];
  let skipped = 0;
  for (const line of lines) {
    const w = line.bbox.x1 - line.bbox.x0;
    const h = line.bbox.y1 - line.bbox.y0;
    if (!/\p{L}{2,}|\p{N}/u.test(line.text) || !isReadableLine(line, minConfidence) || w < 4 || h < 4) {
      if (line.text.trim() !== '') skipped++;
      continue;
    }
    const patch: Rect = { x: line.bbox.x0 - 3, y: line.bbox.y0 - 3, w: w + 6, h: h + 6 };
    const color = ringColorOf(patch);
    let size = Math.max(10, Math.round(h * SIZE_OF_BOX));
    // The box height misleads (capitals have no descenders, so the box is short), but the width does not:
    // size the type so this text, in this font, is as wide as the line was.
    const measured = fit.widthAt?.(line.text, size) ?? 0;
    if (measured > 0 && line.text.trim().length >= 3) size = Math.min(Math.round(h * 2), Math.max(10, Math.round((size * w) / measured)));
    const ink = fit.inkOf?.(patch, color) ?? null;
    layers.push(
      newLayer({
        text: line.text,
        original: line.text,
        x: line.bbox.x0,
        y: line.bbox.y0 + (h - size * LINE_HEIGHT) / 2,
        maxWidth: w + 6,
        erase: { ...patch, color },
        style: {
          ...DEFAULT_STYLE,
          size,
          bold: false,
          align: 'left',
          lineHeight: LINE_HEIGHT,
          color: ink ?? (luminance(color) > 0.55 ? '#111111' : '#ffffff'),
          outline: null,
        },
      }),
    );
  }
  return { layers, skipped };
}
