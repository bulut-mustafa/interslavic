import type { ParsedSentence } from '../../types/index.ts';
import type { Translation } from '../../engine/src/pipeline.ts';
import { ParserUnavailable } from '../../engine/src/source/parse-client.ts';

/**
 * Many short lines in, one translation per line out, with each line kept apart.
 * Built for subtitles: a cue must stay a cue, so every line is parsed and
 * translated on its own and the results come back in order.
 */

export const BATCH_LIMITS = {
  lines: 60,
  lineChars: 500,
  totalChars: 6000,
} as const;

export interface LineResult {
  /** The translation; a line with no letters in it (music notes) comes back as it was. */
  text: string;
  /** True when something about this line deserves a second look. */
  flagged: boolean;
  /** Why, in words: the engine's own signals, nothing added. */
  reasons: string[];
}

export interface BatchDeps {
  parse(text: string): Promise<ParsedSentence[]>;
  translate(sentence: ParsedSentence): Translation;
}

/** An error message for a batch that is not acceptable, else null. */
export function checkBatch(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.some((l) => typeof l !== 'string')) {
    return '"lines" must be a list of strings';
  }
  if (lines.length > BATCH_LIMITS.lines) return `at most ${BATCH_LIMITS.lines} lines at a time`;
  if ((lines as string[]).some((l) => l.length > BATCH_LIMITS.lineChars)) {
    return `a line may have at most ${BATCH_LIMITS.lineChars} characters`;
  }
  if ((lines as string[]).reduce((n, l) => n + l.length, 0) > BATCH_LIMITS.totalChars) {
    return `at most ${BATCH_LIMITS.totalChars} characters at a time`;
  }
  return null;
}

/** The engine's own doubts about one translated sentence. */
export function reasonsFor(t: Translation): string[] {
  const reasons: string[] = [];
  const unverified = t.words.filter((w) => w.validation !== 'validated').map((w) => w.surface);
  if (unverified.length > 0) reasons.push(`not verified in the lexicon: ${unverified.join(', ')}`);
  for (const w of t.words) {
    for (const f of w.features) {
      if (f.confidence === 'guess') reasons.push(`guessed ${f.name.toLowerCase()} of ${w.surface}`);
    }
  }
  for (const warning of t.warnings ?? []) reasons.push(warning);
  return reasons;
}

export async function translateLines(lines: string[], deps: BatchDeps): Promise<LineResult[]> {
  const out: LineResult[] = [];
  for (const line of lines) {
    if (!/\p{L}/u.test(line)) {
      out.push({ text: line, flagged: false, reasons: [] });
      continue;
    }
    let sentences: Translation[];
    try {
      sentences = (await deps.parse(line)).map((s) => deps.translate(s));
    } catch (err) {
      // A dead parser fails every line alike, so it fails the request; any
      // other error is this line's own and must not cost the other lines.
      if (err instanceof ParserUnavailable) throw err;
      out.push({ text: line, flagged: true, reasons: ['could not translate this line'] });
      continue;
    }
    const reasons = sentences.flatMap(reasonsFor);
    out.push({
      text: sentences.map((s) => s.text).join(' '),
      flagged: reasons.length > 0,
      reasons,
    });
  }
  return out;
}
