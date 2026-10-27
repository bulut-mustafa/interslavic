import { paradigm, type MorphToken } from '../../morph/src/realize.ts';
import { derive } from '@interslavic/morphology';
import { toStandard } from '../../morph/src/orthography.ts';
import type { Entry, Lexicon } from './reader.ts';

/**
 * The full-form lexicon: every inflected form of every dictionary entry.
 *
 * This is the project's keystone artifact. Output cannot be reviewed by a
 * fluent speaker sentence by sentence, so correctness cannot rest on a human
 * eye:
 *
 *   1. VALIDATION   - every generated word must resolve to a known form, so
 *                     the engine catches its own invented non-words.
 *   2. ANALYSIS     - inverted, it maps a surface form back to lemma+features,
 *                     which is the analyser the reverse direction needs.
 *   3. WORD LOOKUP  - the paradigms are already computed.
 *
 * Forms are indexed under BOTH their etymological spelling (as the dictionary
 * cites them) and their standard fold, because the engine renders standard
 * orthography by default - validating "hlapec" against an index containing only
 * "hlåpėc" would fail for every word with an etymological letter.
 */

export interface Reading {
  lemma: string;
  xpos: string;
  feats: Record<string, string>;
}

export interface FullFormIndex {
  /** Distinct surface keys (etymological + folded). */
  readonly size: number;
  /** Total generated forms, before de-duplication. */
  readonly generated: number;
  /** Entries whose paradigm could not be generated at all. */
  readonly skipped: number;
  /** Is this a form of some known Interslavic word? */
  has(form: string): boolean;
  /** Every analysis of this form; empty when unknown. Syncretism is real, so
   *  a single form routinely has several readings. */
  analyze(form: string): Reading[];
}

const key = (form: string): string => form.trim().toLowerCase();

export interface BuildOptions {
  /** Index only every nth entry. For fast tests, not for real use. */
  sample?: number;
}

export function buildFullFormIndex(lex: Lexicon, opts: BuildOptions = {}): FullFormIndex {
  const index = new Map<string, Reading[]>();
  let generated = 0;
  let skipped = 0;
  const step = opts.sample ?? 1;

  const add = (form: string, reading: Reading): void => {
    const k = key(form);
    if (!k) return;
    /**
     * The morphology library reports a stem it cannot handle by returning a
     * form containing "ERROR" rather than by throwing. Indexing those made the
     * validator certify them as real Interslavic forms, so a translation
     * containing "ERROR2ų" passed validation.
     */
    if (k.includes('error')) return;
    let bucket = index.get(k);
    if (!bucket) index.set(k, (bucket = []));
    // Collapse duplicate readings, which syncretism produces in bulk.
    if (!bucket.some((r) => r.lemma === reading.lemma && r.xpos === reading.xpos)) {
      bucket.push(reading);
    }
  };

  let i = 0;
  for (const entry of lex.entries) {
    if (i++ % step !== 0) continue;

    let tokens: MorphToken[] = [];
    try {
      tokens = paradigm(entry.lemma, entry.pos.xpos, entry.addition.principalParts);
    } catch {
      tokens = [];
    }
    if (tokens.length === 0) {
      skipped++;
      // An indeclinable still has its citation form, which must validate.
      addEntryCitation(entry, add);
      continue;
    }

    for (const t of tokens) {
      if (!t.form) continue;
      generated++;
      const reading: Reading = { lemma: entry.lemma, xpos: entry.pos.xpos, feats: t.feats ?? {} };
      add(t.form, reading);
      const folded = toStandard(t.form);
      if (folded !== t.form) add(folded, reading);
    }

    /**
     * DERIVED words and their paradigms: comparatives, superlatives and the
     * participles. The engine emits these - "večši", "najlěpši", "ljubjena" -
     * and they are real Interslavic forms, but the index was built from
     * `inflect()` alone and so reported every one of them as unvalidated.
     *
     * That is worse than a gap: the validation rate is the project's primary
     * quality metric, and flagging correct output teaches the reader to
     * distrust the right answer.
     */
    for (const derived of derivedHeadwords(entry)) {
      let forms: MorphToken[] = [];
      try {
        forms = paradigm(derived.lemma, derived.xpos);
      } catch {
        forms = [];
      }
      const reading: Reading = { lemma: derived.lemma, xpos: derived.xpos, feats: {} };
      add(derived.lemma, reading);
      const foldedLemma = toStandard(derived.lemma);
      if (foldedLemma !== derived.lemma) add(foldedLemma, reading);
      for (const f of forms) {
        if (!f.form) continue;
        generated++;
        const r: Reading = { lemma: derived.lemma, xpos: derived.xpos, feats: f.feats ?? {} };
        add(f.form, r);
        const folded = toStandard(f.form);
        if (folded !== f.form) add(folded, r);
      }
    }

    addEntryCitation(entry, add);
  }

  return {
    size: index.size,
    generated,
    skipped,
    has: (form) => index.has(key(form)),
    analyze: (form) => index.get(key(form)) ?? [],
  };
}

/**
 * The headwords `derive()` produces for an entry, each with the part of speech
 * it should be inflected as. Comparatives, superlatives and participles all
 * decline like adjectives.
 */
function derivedHeadwords(entry: Entry): { lemma: string; xpos: string }[] {
  if (entry.pos.upos !== 'ADJ' && entry.pos.upos !== 'ADV' && entry.pos.upos !== 'VERB') return [];
  let tokens;
  try {
    tokens = derive({ form: entry.lemma, xpos: entry.pos.xpos } as never) as {
      form: string;
      xpos?: string;
    }[];
  } catch {
    return [];
  }
  if (!Array.isArray(tokens)) return [];

  return tokens
    .filter((t) => t.form)
    .map((t) => ({
      lemma: t.form,
      // Everything derive() yields here either declines as an adjective
      // (comparatives, superlatives, participles) or is a noun (the verbal
      // noun), and the library's own xpos says which.
      xpos: t.xpos?.startsWith('n.') ? t.xpos : 'adj.',
    }));
}

function addEntryCitation(
  entry: Entry,
  add: (form: string, reading: Reading) => void,
): void {
  const reading: Reading = { lemma: entry.lemma, xpos: entry.pos.xpos, feats: {} };
  add(entry.lemma, reading);
  const folded = toStandard(entry.lemma);
  if (folded !== entry.lemma) add(folded, reading);
}
