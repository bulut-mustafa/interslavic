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

export async function parseText(
  text: string,
  lang: SourceLang,
  opts: ParseOptions = {},
): Promise<ParsedSentence[]> {
  const url = opts.url ?? DEFAULT_PARSER_URL;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let res: Response;
  try {
    res = await fetch(`${url}/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Look-alike Latin letters inside Cyrillic words would mislead the parser.
      body: JSON.stringify({ text: fixMixedScript(text, lang), lang }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new ParserUnavailable(url, cause);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`parser returned HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }

  const body = (await res.json()) as WireResponse;
  return body.sentences.map(
    (s): ParsedSentence => ({
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
    }),
  );
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
