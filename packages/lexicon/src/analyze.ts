import { fromCyrillic, toStandard } from '../../morph/src/orthography.ts';
import type { FullFormIndex } from './full-forms.ts';
import type { Entry, Lexicon } from './reader.ts';

/**
 * Reads Interslavic text the other way round from the translator: for each
 * word, is it a form of a dictionary word, and if so of which, in what form,
 * meaning what. Everything shown comes from the dictionary and the full-form
 * index; nothing is guessed. A word the index does not hold is reported as
 * not found - which is a claim about the dictionary, not about the language.
 */

export interface AnalyzedReading {
  /** The dictionary's headword, in the etymological alphabet it cites. */
  lemma: string;
  /** The dictionary's part-of-speech label, e.g. "f." or "v.tr. ipf.". */
  pos: string;
  /**
   * Every feature set this form has for this lemma, as Universal Dependencies
   * features, e.g. [{ Case: 'Dat', ... }, { Case: 'Loc', ... }] for "ženě".
   */
  featSets: Record<string, string>[];
  /** English glosses from the dictionary; empty for a derived headword. */
  en: string[];
  /** Russian glosses from the dictionary. */
  ru: string[];
}

export type WordStatus = 'known' | 'unknown' | 'maybe-name';

export interface AnalyzedWord {
  kind: 'word';
  /** Exactly as written. */
  text: string;
  script: 'latin' | 'cyrillic';
  /** Standard Latin, lower case - the form that was looked up. */
  normal: string;
  /**
   * known: a form of some dictionary word.
   * maybe-name: not found, but capitalised - likely a name the dictionary lacks.
   * unknown: not found.
   */
  status: WordStatus;
  /**
   * Set when the word was found only by reading e as ě (the orthography page's
   * allowed simplification); then `normal` is the form with ě that matched.
   */
  readAs?: string[];
  /** The word holds letters outside the Interslavic alphabets. */
  foreignLetters: boolean;
  /** Most useful first; at most MAX_READINGS. */
  readings: AnalyzedReading[];
  /** How many readings the form has in all. */
  totalReadings: number;
  /** Nearest dictionary forms, only for a word that was not found. */
  suggestions: string[];
}

export interface AnalyzedGap {
  kind: 'gap';
  text: string;
}

export type AnalyzedToken = AnalyzedWord | AnalyzedGap;

export interface TextAnalysis {
  tokens: AnalyzedToken[];
  words: number;
  notFound: number;
}

export const MAX_READINGS = 6;
/** Suggestions are searched for this many distinct unfound words, no more. */
export const MAX_SUGGESTED_WORDS = 20;
const MAX_SUGGESTIONS = 5;

const WORD = /[\p{L}\p{M}]+/gu;
const CYRILLIC = /\p{Script=Cyrillic}/u;
/** Standard Latin alphabet plus the etymological letters the index also holds. */
const INTERSLAVIC_LETTERS = /^[a-zčšžěćđęųåėȯĺľńŕťďśź]+$/u;

export function analyzeText(text: string, lex: Lexicon, index: FullFormIndex): TextAnalysis {
  const tokens: AnalyzedToken[] = [];
  const suggested = new Map<string, string[]>();
  let last = 0;
  let words = 0;
  let notFound = 0;

  for (const m of text.matchAll(WORD)) {
    if (m.index > last) tokens.push({ kind: 'gap', text: text.slice(last, m.index) });
    last = m.index + m[0].length;
    words++;

    const word = analyzeWord(m[0], lex, index);
    if (word.status !== 'known') {
      notFound++;
      if (word.status === 'unknown' && !word.foreignLetters) {
        let list = suggested.get(word.normal);
        if (!list && suggested.size < MAX_SUGGESTED_WORDS) {
          list = suggest(word.normal, lex, index);
          suggested.set(word.normal, list);
        }
        word.suggestions = list ?? [];
      }
    }
    tokens.push(word);
  }
  if (last < text.length) tokens.push({ kind: 'gap', text: text.slice(last) });
  return { tokens, words, notFound };
}

function analyzeWord(text: string, lex: Lexicon, index: FullFormIndex): AnalyzedWord {
  const script = CYRILLIC.test(text) ? 'cyrillic' : 'latin';
  const normal = (script === 'cyrillic' ? fromCyrillic(text) : toStandard(text)).toLowerCase();
  const foreignLetters = !INTERSLAVIC_LETTERS.test(normal);
  const word: AnalyzedWord = {
    kind: 'word',
    text,
    script,
    normal,
    status: 'unknown',
    foreignLetters,
    readings: [],
    totalReadings: 0,
    suggestions: [],
  };

  let readings = index.analyze(normal);
  if (readings.length === 0) {
    const longer = index.lookupSimplified(normal);
    if (longer.length > 0) {
      readings = longer.flatMap((f) => index.analyze(f));
      word.readAs = longer;
    }
  }

  if (readings.length === 0) {
    word.status = /^\p{Lu}/u.test(text) ? 'maybe-name' : 'unknown';
    return word;
  }

  const ranked = readings
    .map((r) => ({ r, entry: entryFor(lex, r.lemma, r.xpos) }))
    .sort(
      (a, b) =>
        Number(a.r.lemma.includes(' ')) - Number(b.r.lemma.includes(' ')) ||
        (b.entry?.frequency ?? -1) - (a.entry?.frequency ?? -1) ||
        a.r.lemma.localeCompare(b.r.lemma),
    );
  word.status = 'known';
  word.totalReadings = ranked.length;
  word.readings = ranked.slice(0, MAX_READINGS).map(({ r, entry }) => ({
    lemma: r.lemma,
    pos: r.xpos,
    featSets: [r.feats, ...(r.otherFeats ?? [])],
    en: entry ? entry.glosses.map((g) => g.text) : [],
    ru: entry ? entry.ruGlosses.map((g) => g.text) : [],
  }));
  return word;
}

/** The dictionary entry a reading belongs to; none for a derived headword. */
function entryFor(lex: Lexicon, lemma: string, xpos: string): Entry | undefined {
  const hits = lex.lookupLemma(lemma);
  return hits.find((e) => e.pos.xpos === xpos) ?? hits[0];
}

/**
 * The commonest nearby dictionary forms. "Nearby" is edit distance only - one
 * edit for short words, two for longer - and "common" is the dictionary's own
 * corpus frequency, so a suggestion is always a real form of a real word.
 */
function suggest(normal: string, lex: Lexicon, index: FullFormIndex): string[] {
  const maxDistance = normal.length <= 4 ? 1 : 2;
  const scored = index.nearest(normal, maxDistance, 2000).map(({ form, distance }) => {
    const top = Math.max(
      -1,
      ...index.analyze(form).map((r) => entryFor(lex, r.lemma, r.xpos)?.frequency ?? -1),
    );
    return { form, distance, top };
  });
  scored.sort((a, b) => a.distance - b.distance || b.top - a.top || a.form.localeCompare(b.form));
  return scored.slice(0, MAX_SUGGESTIONS).map((s) => s.form);
}
