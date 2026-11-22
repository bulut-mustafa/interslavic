import type { OcrLine } from './ocr.ts';

/**
 * Whether what the reader found is text at all. Tesseract returns lines for
 * pictures with no lettering in them (foliage, gravel, fabric, sensor noise),
 * and the OCR docs do not say what its confidence numbers mean or give a level
 * below which to distrust them, so these levels come from measuring: 2000
 * lines it returned on 34 text-free pictures, in each of eng, rus and ukr, and
 * 495 lines it returned on 130 pictures of real lettering
 * (test/readable-text.test.ts holds fixtures of them).
 *
 *  - Lines read from nothing: the highest line confidence was 56, and the
 *    most confident word of three letters or more was 67 (single characters
 *    reached 95).
 *  - Real lines: the median line confidence was 96, and 95% were above 69.
 *
 * So a line is text when it is either sure of itself (line confidence 75+, with
 * a word of two letters or two digits), or fairly sure (55+) and holds a word of
 * three letters or more that the reader is itself 70+ sure of. A single
 * character, however confident, is not text: the reader gave '|', '©' and '4'
 * 90+ on gravel.
 */
export const READABLE = {
  /** A line this sure of itself is text if it has any word of two letters or two digits. */
  sureLine: 75,
  /** A line must be at least this sure to count at all through its words. */
  fairLine: 55,
  /** ...and have a word of three letters or more at least this sure. */
  anchorWord: 70,
  /** Words below this are left out of a line that is kept. */
  minWord: 40,
} as const;

const lettersIn = (t: string) => (t.match(/\p{L}/gu) ?? []).length;
const digitsIn = (t: string) => (t.match(/\p{N}/gu) ?? []).length;

/** The words of a line with how sure the reader is of each; a line without words counts as its own text split on spaces. */
function wordsOf(line: OcrLine): { text: string; confidence: number }[] {
  if (line.words && line.words.length > 0) return line.words;
  return line.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: line.confidence }));
}

/** Is this line real lettering rather than what the reader makes of texture? `floor` is a further minimum for the line and its anchor word. */
export function isReadableLine(line: OcrLine, floor: number = READABLE.minWord): boolean {
  const c = line.confidence;
  if (c < floor) return false;
  const words = wordsOf(line);
  if (c >= READABLE.sureLine) return words.some((w) => lettersIn(w.text) >= 2 || digitsIn(w.text) >= 2);
  return c >= READABLE.fairLine && words.some((w) => lettersIn(w.text) >= 3 && w.confidence >= READABLE.anchorWord);
}

/** The lines of a read that are text; an empty answer means the picture has none. */
export const readableLines = (lines: OcrLine[], floor: number = READABLE.minWord): OcrLine[] => lines.filter((l) => isReadableLine(l, floor));
