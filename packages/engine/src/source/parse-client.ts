import type { ParsedSentence, SourceLang, UdToken } from '../../../types/index.ts';
import { fixMixedScript } from '../../../rules/src/mixed-script.ts';

/**
 * Client for the Python parsing service.
 *
 * The wire format is JSON shaped exactly like `UdToken`, so there is no
 * translation layer: CoNLL-U is the *data model*, but text CoNLL-U is used only
 * for frozen fixtures, never on the hot path.
 */

export const DEFAULT_PARSER_URL = 'http://127.0.0.1:8765';

export class ParserUnavailable extends Error {
  constructor(url: string, cause: unknown) {
    super(
      `could not reach the parser service at ${url}.\n` +
        `Start it with:  npm run parser\n` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'ParserUnavailable';
  }
}

/** The parser answered, but with an error. */
export class ParserError extends Error {
  override name = 'ParserError';
}

interface WireToken {
  id: number;
  form: string;
  lemma: string;
  upos: string;
  xpos?: string;
  feats?: Record<string, string>;
  head: number;
  deprel: string;
}

interface WireResponse {
  sentences: { text: string; lang: SourceLang; tokens: WireToken[] }[];
}

export interface ParseOptions {
  url?: string;
  /** Cold start loads a model, which takes several seconds. */
  timeoutMs?: number;
}

type WireSentence = WireResponse['sentences'][number];

/** POST to the parser and read its JSON, mapping failures to the two error kinds. */
async function post<T>(route: string, payload: unknown, opts: ParseOptions): Promise<T> {
  const url = opts.url ?? DEFAULT_PARSER_URL;
  let res: Response;
  try {
    res = await fetch(`${url}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (cause) {
    throw new ParserUnavailable(url, cause);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ParserError(`parser returned HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }
  return (await res.json().catch((e: unknown) => {
    throw new ParserError(`parser sent a body that is not JSON: ${String(e)}`);
  })) as T;
}

const toSentence = (s: WireSentence): ParsedSentence => ({
  text: s.text,
  lang: s.lang,
  tokens: s.tokens.map(
    (t): UdToken => ({
      id: t.id,
      form: t.form,
      lemma: t.lemma,
      upos: t.upos,
      ...(t.xpos ? { xpos: t.xpos } : {}),
      feats: t.feats ?? {},
      head: t.head,
      deprel: t.deprel,
    }),
  ),
});

export async function parseText(
  text: string,
  lang: SourceLang,
  opts: ParseOptions = {},
): Promise<ParsedSentence[]> {
  // Look-alike Latin letters inside Cyrillic words would mislead the parser.
  const body = await post<WireResponse>('/parse', { text: fixMixedScript(text, lang), lang }, opts);
  return body.sentences.map(toSentence);
}

/**
 * Several texts in one request, one list of sentences per text, in order. The
 * English tagger is a transformer, and in a batch it ran about 3x faster per
 * sentence (docs/verification/testing-and-oracles.md, 2026-11-22).
 */
export async function parseTexts(
  texts: string[],
  lang: SourceLang,
  opts: ParseOptions = {},
): Promise<ParsedSentence[][]> {
  const body = await post<{ results: WireSentence[][] }>(
    '/parse-many', { texts: texts.map((t) => fixMixedScript(t, lang)), lang }, opts);
  return body.results.map((sentences) => sentences.map(toSentence));
}

/** Quick liveness probe, so the CLI can fail with advice instead of a timeout. */
export async function parserHealthy(url = DEFAULT_PARSER_URL): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
