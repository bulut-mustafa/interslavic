import { paradigm, type MorphToken } from '../../morph/src/realize.ts';
import { derive } from '@interslavic/morphology';
import { toSimplified, toStandard } from '../../morph/src/orthography.ts';
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
  /**
   * The other feature sets the SAME lemma and part of speech gives this form.
   * A form is often several at once - "ženě" is dative and locative, "ženy"
   * genitive singular, nominative plural and accusative plural - and the index
   * keeps one reading per lemma, so without this the others were thrown away.
   */
  otherFeats?: Record<string, string>[];
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
  /**
   * Standard-alphabet forms written WITHOUT ě that stand for forms with it.
   * The orthography page allows e for ě as a legitimate simplification
   * (http://steen.free.fr/interslavic/orthography.html), so "zene" is read as
   * "ženě". Empty when the form is not such a simplification.
   */
  lookupSimplified(form: string): string[];
  /**
   * Standard-alphabet forms within `maxDistance` edits (insert, delete,
   * substitute, swap two neighbours) of `form`, nearest first, at most `limit`.
   */
  nearest(form: string, maxDistance: number, limit?: number): { form: string; distance: number }[];
}

const key = (form: string): string => form.trim().toLowerCase();

const sameFeats = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

export interface BuildOptions {
  /** Index only every nth entry. For fast tests, not for real use. */
  sample?: number;
}

/** What building the index produces, before it is wrapped in its lookups: this is what can be saved and loaded. */
export interface FullFormData {
  index: Map<string, Reading[]>;
  generated: number;
  skipped: number;
}

export function buildFullFormIndex(lex: Lexicon, opts: BuildOptions = {}): FullFormIndex {
  return fullFormIndexFrom(computeFullFormData(lex, opts));
}

/** The slow part: every form of every entry, worked out from the dictionary. Seconds, and 350 MB, which is why it can be done ahead of time and saved. */
export function computeFullFormData(lex: Lexicon, opts: BuildOptions = {}): FullFormData {
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
    // One reading per lemma and part of speech; a different feature set of the
    // same one is kept on it rather than dropped (syncretism produces them in bulk).
    const same = bucket.find((r) => r.lemma === reading.lemma && r.xpos === reading.xpos);
    if (!same) {
      bucket.push(reading);
    } else if (same !== reading) {
      const known = [same.feats, ...(same.otherFeats ?? [])];
      if (!known.some((f) => sameFeats(f, reading.feats))) {
        (same.otherFeats ??= []).push(reading.feats);
      }
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

  return { index, generated, skipped };
}

/**
 * Makes the readings share what they repeat. The index holds 1.3 million
 * readings but only about 46,000 distinct lemmas and parts of speech and 1,400
 * distinct feature sets; loaded from a file, each is a separate copy, and
 * sharing them takes the index from about 400 MB of heap to about 150 MB. The
 * shared feature sets are frozen, so nothing can change one reading's features
 * and change every other's by accident.
 */
export function internReadings(data: FullFormData): FullFormData {
  const strings = new Map<string, string>();
  const featSets = new Map<string, Record<string, string>>();
  const text = (x: string): string => {
    const known = strings.get(x);
    if (known !== undefined) return known;
    strings.set(x, x);
    return x;
  };
  const feats = (f: Record<string, string>): Record<string, string> => {
    const key = JSON.stringify(f);
    const known = featSets.get(key);
    if (known) return known;
    featSets.set(key, Object.freeze(f));
    return f;
  };
  const done = new Set<Reading>(); // a reading is shared between the etymological and the folded key: do it once
  for (const bucket of data.index.values()) {
    for (const r of bucket) {
      if (done.has(r)) continue;
      done.add(r);
      r.lemma = text(r.lemma);
      r.xpos = text(r.xpos);
      r.feats = feats(r.feats);
      if (r.otherFeats) r.otherFeats = r.otherFeats.map(feats);
    }
  }
  return data;
}

/** The lookups over a built (or loaded) index. */
export function fullFormIndexFrom(data: FullFormData): FullFormIndex {
  const { index, generated, skipped } = data;

  /** Built on first use: the translator never asks, and the maps are not small. */
  let standardByLength: Map<number, string[]> | null = null;
  const standardKeys = (): Map<number, string[]> => {
    if (standardByLength) return standardByLength;
    standardByLength = new Map();
    for (const k of index.keys()) {
      if (ETYMOLOGICAL_LETTER.test(k) || k.includes(' ')) continue;
      let bucket = standardByLength.get(k.length);
      if (!bucket) standardByLength.set(k.length, (bucket = []));
      bucket.push(k);
    }
    return standardByLength;
  };

  let simplified: Map<string, string[]> | null = null;
  const simplifiedKeys = (): Map<string, string[]> => {
    if (simplified) return simplified;
    simplified = new Map();
    for (const bucket of standardKeys().values()) {
      for (const k of bucket) {
        if (!k.includes('ě')) continue;
        const plain = toSimplified(k);
        const list = simplified.get(plain);
        if (list) list.push(k);
        else simplified.set(plain, [k]);
      }
    }
    return simplified;
  };

  return {
    size: index.size,
    generated,
    skipped,
    has: (form) => index.has(key(form)),
    analyze: (form) => index.get(key(form)) ?? [],
    lookupSimplified: (form) => simplifiedKeys().get(key(form)) ?? [],
    nearest: (form, maxDistance, limit = 200) => {
      const target = key(form);
      const found: { form: string; distance: number }[] = [];
      for (let len = target.length - maxDistance; len <= target.length + maxDistance; len++) {
        for (const k of standardKeys().get(len) ?? []) {
          const distance = editDistance(target, k, maxDistance);
          if (distance <= maxDistance && k !== target) found.push({ form: k, distance });
        }
      }
      found.sort((a, b) => a.distance - b.distance || a.form.localeCompare(b.form));
      return found.slice(0, limit);
    },
  };
}

/** The letters that exist only in the etymological alphabet (see orthography.ts). */
const ETYMOLOGICAL_LETTER = /[ęųåėȯćđĺľńŕťďśź]/;

/**
 * Optimal-string-alignment distance: an insertion, deletion, substitution or
 * swap of two neighbours each cost 1. Gives up and returns `limit + 1` as soon
 * as no alignment can come in under `limit`, which is what keeps scanning the
 * whole index cheap.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      row.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
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
