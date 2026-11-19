import { formatSrt, planCue, type Cue, type CuePlan } from './srt.ts';

/**
 * Translating a subtitle file through /api/translate-batch.
 *
 * The limits mirror the server's (packages/server/src/batch.ts): a request
 * carries at most 50 lines and 5,000 characters, so a file goes as many small
 * batches in order. A busy server (429) is retried; any other failure stops the
 * run, because a half-translated file mislabelled as finished would be worse
 * than none.
 */

const API = '';
const MAX_LINES = 50;
const MAX_CHARS = 5000;
/** The server's per-line limit; a longer unit is left in its own language, and flagged. */
const MAX_LINE = 500;
export const MAX_CUES = 1500;

export type SourceLang = 'en' | 'ru' | 'uk';
export type Script = 'standard' | 'etymological' | 'simplified' | 'cyrillic';
export type Output = 'isv' | 'bilingual';

export interface CueResult {
  /** The translated lines, ready for the cue. */
  lines: string[];
  flagged: boolean;
  reasons: string[];
}

interface Unit {
  cue: number;
  slot: number;
  text: string;
}

export interface BatchLine {
  text: string;
  flagged: boolean;
  reasons: string[];
}

export function batches(units: Unit[]): Unit[][] {
  const out: Unit[][] = [];
  let current: Unit[] = [];
  let chars = 0;
  for (const u of units) {
    if (current.length >= MAX_LINES || chars + u.text.length > MAX_CHARS) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(u);
    chars += u.text.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Busy (429) or not ready yet (the gateway's 502-504 while the service starts): worth another try. */
const RETRY_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

async function postBatch(
  lines: string[],
  lang: SourceLang,
  orthography: Script,
  signal: AbortSignal | undefined,
  retryDelayMs: number,
): Promise<BatchLine[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/api/translate-batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, lang, orthography }),
      signal,
    });
    // A gateway error from a starting-up server is not JSON, so read it defensively.
    const body = (await res.json().catch(() => ({}))) as { results?: BatchLine[]; error?: string };
    if (RETRY_STATUS.has(res.status) && attempt < 5) {
      await sleep(retryDelayMs, signal);
      continue;
    }
    if (!res.ok) {
      // The server's own text for a down parser is an instruction for whoever runs it.
      throw new Error(
        RETRY_STATUS.has(res.status)
          ? 'The translator is not answering. It may still be starting up - please try again in a minute.'
          : (body.error ?? `request failed (${res.status})`),
      );
    }
    if (!body.results || body.results.length !== lines.length) throw new Error('the translator returned an incomplete answer');
    return body.results;
  }
}

export interface RunOptions {
  lang: SourceLang;
  script: Script;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Wait before retrying a busy server; short in tests. */
  retryDelayMs?: number;
}

export async function translateCues(cues: Cue[], opts: RunOptions): Promise<CueResult[]> {
  const plans: CuePlan[] = cues.map(planCue);
  const translated: string[][] = plans.map((p) => Array<string>(p.units.length).fill(''));
  const flags = cues.map(() => ({ flagged: false, reasons: [] as string[] }));
  const units: Unit[] = plans.flatMap((p, cue) => p.units.map((text, slot) => ({ cue, slot, text })));

  // A film repeats itself ("Yes.", "What?", "Come on!"), and each line is translated on its own, so a line that
  // appears again has the same answer: it is sent once and the answer is given to every place it appears.
  const groups = new Map<string, Unit[]>();
  for (const u of units) groups.get(u.text)?.push(u) ?? groups.set(u.text, [u]);
  const distinct = [...groups.values()];

  let done = 0;
  opts.onProgress?.(0, units.length);
  for (const batch of batches(distinct.map((g) => g[0]!))) {
    const sendable = batch.filter((u) => u.text.length <= MAX_LINE);
    for (const u of batch.filter((x) => x.text.length > MAX_LINE)) {
      for (const same of groups.get(u.text)!) {
        translated[same.cue]![same.slot] = u.text;
        flags[same.cue]!.flagged = true;
        flags[same.cue]!.reasons.push(`longer than ${MAX_LINE} characters, left untranslated`);
      }
    }
    if (sendable.length > 0) {
      const results = await postBatch(sendable.map((u) => u.text), opts.lang, opts.script, opts.signal, opts.retryDelayMs ?? 2000);
      sendable.forEach((u, i) => {
        const r = results[i]!;
        for (const same of groups.get(u.text)!) {
          translated[same.cue]![same.slot] = r.text;
          if (r.flagged) {
            flags[same.cue]!.flagged = true;
            flags[same.cue]!.reasons.push(...r.reasons);
          }
        }
      });
    }
    done += batch.reduce((n, u) => n + groups.get(u.text)!.length, 0);
    opts.onProgress?.(done, units.length);
  }

  return plans.map((p, i) => ({
    lines: p.units.length === 0 ? p.rebuild([]) : p.rebuild(translated[i]!),
    flagged: flags[i]!.flagged,
    reasons: flags[i]!.reasons,
  }));
}

/** The finished file: Interslavic alone, or Interslavic with each cue's original lines beneath. */
export function buildSrt(cues: Cue[], results: CueResult[], output: Output): string {
  return formatSrt(
    cues.map((c, i) => {
      // A cue with nothing to translate (music notes) is not shown twice.
      const translatable = planCue(c).units.length > 0;
      return { ...c, lines: output === 'bilingual' && translatable ? [...results[i]!.lines, ...c.lines] : results[i]!.lines };
    }),
  );
}

/**
 * Translates separate short texts, one result each, in order: in batches the
 * server accepts, with the same retry of a busy or starting-up server as a
 * subtitle file. A text longer than the server's limit comes back unchanged
 * and flagged.
 */
export async function translateTexts(texts: string[], opts: RunOptions): Promise<BatchLine[]> {
  const out: BatchLine[] = texts.map((t) => ({ text: t, flagged: true, reasons: [`longer than ${MAX_LINE} characters, left untranslated`] }));
  const units: Unit[] = texts
    .map((text, i) => ({ cue: i, slot: 0, text: text.replace(/\s+/g, ' ').trim() }))
    .filter((u) => u.text !== '' && u.text.length <= MAX_LINE && /\p{L}/u.test(u.text));
  for (let i = 0; i < texts.length; i++) {
    if (!units.some((u) => u.cue === i)) out[i] = { text: texts[i]!, flagged: false, reasons: [] };
  }
  for (const batch of batches(units)) {
    const results = await postBatch(batch.map((u) => u.text), opts.lang, opts.script, opts.signal, opts.retryDelayMs ?? 2000);
    batch.forEach((u, k) => (out[u.cue] = results[k]!));
  }
  return out;
}
