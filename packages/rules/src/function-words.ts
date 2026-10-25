import fs from 'node:fs';
import path from 'node:path';

/**
 * Curated lemma choices for closed-class words.
 *
 * Frequency ranking is the wrong tool for these. There are only a few dozen,
 * they appear in nearly every sentence, and the dictionary's glosses actively
 * mislead: "that" ranked `tamto` first because it is glossed exactly "that",
 * while the general demonstrative `tȯj` is glossed "this, that" and therefore
 * looked like a weaker match - but `tamto` means "that over there".
 *
 * Every entry cites the source that justifies it. An open-class word is
 * curated only for a sense the parse itself shows (see `whenDependent`), so
 * its other senses stay with dictionary ranking.
 */

export interface FunctionWord {
  /** The source lemma. Named `en` for the original English-only table. */
  en: string;
  /**
   * Source language this entry is keyed for. Defaults to English, so every
   * existing entry keeps its meaning. Russian needs its own entries because
   * frequency ranking misleads there too: `нет` ranks the interjection `ne`
   * ("no") above `nema` ("there is/are no"), and `его` ranks a personal-pronoun
   * oblique form above the possessive.
   */
  lang?: string;
  upos: string[];
  /**
   * When set, this entry applies only inside a NEGATED clause. English
   * switches to a positive-polarity indefinite under negation ("a single
   * book", "anywhere", "anymore") where Interslavic negates it, so the right
   * word depends on the clause, not on the source word alone.
   *
   * A conditional entry wins over an unconditional one for the same lemma, so
   * the negated reading is the specific case and the plain entry the default.
   */
  whenNegated?: boolean;
  /**
   * When set, this entry applies only when the source word has a dependent
   * with this relation and, if given, one of these lemmas. This is how an
   * open-class word with two senses is curated without breaking the other
   * one: "three floors" is counted, so storeys (`etaž`), while "on the floor"
   * keeps `podloga`; "came to the party" is an event (`zabava`), while "the
   * party won" keeps `partija`.
   */
  whenDependent?: { deprel: string; lemmas?: string[] };
  /**
   * When set, this entry applies only when the word's HEAD is not one of
   * these parts of speech. "too" modifying an adjective is a degree ("too
   * big", `zamnogo`); modifying anything else it means "also" (`takože`).
   */
  unlessHeadIs?: string[];
  isv: string;
  why: string;
  evidence: string;
  source: string;
}

const DATA = path.resolve(import.meta.dirname, '../data/function-words.json');

let cache: Map<string, FunctionWord[]> | null = null;

function index(): Map<string, FunctionWord[]> {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { words: FunctionWord[] };
  const m = new Map<string, FunctionWord[]>();
  for (const w of raw.words) {
    const key = `${w.lang ?? 'en'}|${w.en.trim().toLowerCase()}`;
    let bucket = m.get(key);
    if (!bucket) m.set(key, (bucket = []));
    bucket.push(w);
  }
  cache = m;
  return m;
}

/** The curated choice for this source lemma and part of speech, if there is one. */
export function functionWordFor(
  lemma: string,
  upos: string,
  lang = 'en',
  negated = false,
  dependents: { deprel: string; lemma: string }[] = [],
  headUpos?: string,
): FunctionWord | null {
  const candidates = index()
    .get(`${lang}|${lemma.trim().toLowerCase()}`)
    ?.filter((w) => w.upos.includes(upos))
    .filter((w) => !(w.unlessHeadIs && headUpos && w.unlessHeadIs.includes(headUpos))) ?? [];
  const hasDependent = ({ whenDependent: want }: FunctionWord) =>
    want !== undefined &&
    dependents.some(
      (d) => d.deprel === want.deprel && (want.lemmas?.includes(d.lemma.toLowerCase()) ?? true),
    );
  // A conditional reading is the more specific entry, so it is tried first.
  return (
    (negated ? candidates.find((w) => w.whenNegated) : undefined) ??
    candidates.find(hasDependent) ??
    candidates.find((w) => !w.whenNegated && !w.whenDependent) ??
    null
  );
}

export function allFunctionWords(): FunctionWord[] {
  return [...index().values()].flat();
}
