import fs from 'node:fs';
import path from 'node:path';
import type { Case } from '../../types/index.ts';

/**
 * Preposition government, generated from the dictionary's own numeric codes
 * (+2=Gen ... +6=Loc) and keyed by the English gloss.
 *
 * The dictionary already splits the ambiguous prepositions by sense, which is
 * exactly what a translator needs:
 *   v  + Loc = "in, within"   vs  v  + Acc = "into"
 *   na + Loc = "on, at"       vs  na + Acc = "onto"
 *   za is three-way (Ins/Acc/Gen), po is three-way (Loc/Acc/Dat)
 *
 * So for English input the English preposition picks both the Interslavic
 * preposition AND the case it governs, in one lookup.
 */
export interface PrepEntry {
  prep: string;
  case: Case;
  en: string[];
  freq: number;
}

export interface PrepCandidate {
  prep: string;
  case: Case;
  freq: number;
  /**
   * True when the dictionary glossed this sense as directional - "under
   * (direction)", "before (direction)", "behind (direction)". That marking IS
   * the motion/location distinction the prepositions page describes, and the
   * index used to throw it away by stripping the parenthetical, so the
   * directional accusative competed with the stable sense on frequency alone
   * and won: "We must leave before midnight" became "prěd polnoč", as if
   * midnight were a destination.
   */
  direction: boolean;
}

const DATA = path.resolve(import.meta.dirname, '../data/preposition-government.json');

let cache: Map<string, PrepCandidate[]> | null = null;
let lemmaCache: Set<string> | null = null;

/**
 * Every Interslavic preposition lemma in the government table.
 *
 * Needed to read the dictionary's `(+N)` codes correctly: of the 78 verb
 * entries carrying one, 33 have a preposition built into the lemma
 * ("obhoditi sę bez (+2)", "obraćati sę k (+3)"), and there the code states
 * what the PREPOSITION governs, not what the verb governs. Treating those as
 * verb government would impose a case on a bare object that should never have
 * had one.
 */
export function prepositionLemmas(): Set<string> {
  if (lemmaCache) return lemmaCache;
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { prepositions: PrepEntry[] };
  lemmaCache = new Set(raw.prepositions.map((row) => row.prep));
  return lemmaCache;
}

/**
 * True when a `(+N)` code on this lemma states what a PREPOSITION governs
 * rather than what the verb governs - i.e. the lemma ends in a preposition.
 *
 * Defensive: these 33 entries are not currently reachable from English input,
 * because lookup is by single lemma and "do without" is never a Stanza lemma.
 * It guards the moment that stops being true, and is unit-tested directly
 * rather than end to end for exactly that reason.
 */
export function codeBelongsToPreposition(lemma: string): boolean {
  const lastWord = lemma.trim().split(/\s+/).at(-1) ?? '';
  return prepositionLemmas().has(lastWord);
}

const normalize = (g: string): string =>
  g.split('(')[0]!.trim().toLowerCase();

function index(): Map<string, PrepCandidate[]> {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { prepositions: PrepEntry[] };
  const m = new Map<string, PrepCandidate[]>();
  for (const row of raw.prepositions) {
    for (const gloss of row.en) {
      const key = normalize(gloss);
      if (!key) continue;
      let bucket = m.get(key);
      if (!bucket) m.set(key, (bucket = []));
      bucket.push({
        prep: row.prep,
        case: row.case,
        freq: row.freq,
        direction: /\(\s*direction\s*\)/i.test(gloss),
      });
    }
  }
  // Most frequent first; ties broken by shorter lemma then alphabetically so
  // the result is a total order and therefore reproducible.
  for (const bucket of m.values()) {
    bucket.sort(
      (a, b) =>
        // A directional sense is only right with a verb of motion, so it never
        // leads by default; the caller asks for it explicitly.
        Number(a.direction) - Number(b.direction) ||
        b.freq - a.freq ||
        a.prep.length - b.prep.length ||
        a.prep.localeCompare(b.prep),
    );
  }
  cache = m;
  return m;
}

/**
 * English spellings of one preposition that the dictionary glosses only one
 * way. "till" is defined as "until" (Wiktionary, preposition sense 1: "Until;
 * to, up to"), and the dictionary glosses `do` (+2) "to, till" but never
 * "until", so "until Friday" fell to the adverb `dopŕva` ("only, just now").
 */
const SAME_PREPOSITION: Record<string, string> = { until: 'till' };

/** Candidates for an English preposition, best first. */
export function candidatesForEnglish(lemma: string): PrepCandidate[] {
  const key = normalize(lemma);
  return index().get(key) ?? index().get(SAME_PREPOSITION[key] ?? '') ?? [];
}

/**
 * English prepositions that are really CASE MARKERS rather than prepositions.
 * Interslavic expresses these with a bare case and no preposition at all, the
 * same way the iobj in "gives the girl a book" becomes a bare dative.
 *
 *   "the book OF the man"  -> kniga mųža      (bare genitive)
 *   "gives a book TO the girl" -> davaje knigu děvě  (bare dative)
 *
 * "to" only behaves this way as a recipient; "walks to the house" is a real
 * directional preposition, so the caller must check for a transfer reading.
 */
export const CASE_MARKER_PREPOSITIONS: Record<string, Case> = {
  of: 'Gen',
  to: 'Dat',
  /**
   * The English possessive clitic, which Stanza tags PART and attaches as a
   * `case` marker exactly like a preposition. It is a genitive marker, the same
   * as "of" - "my brother's book" and "the book of my brother" differ only in
   * English. Untreated it was emitted raw: "Moj brat 's kniga".
   */
  "'s": 'Gen',
};

const AT_INSIDE = path.resolve(import.meta.dirname, '../data/at-inside.json');
let insideCache: Set<string> | null = null;

/**
 * Nouns that English "at" puts you INSIDE of, and that every Slavic language
 * marks with "in": "at school" is в школе, w szkole, ve škole, u školi. The
 * evidence per noun is in data/at-inside.json.
 */
export function isInsidePlace(englishNoun: string): boolean {
  insideCache ??= new Set(Object.keys((JSON.parse(fs.readFileSync(AT_INSIDE, 'utf8')) as { nouns: object }).nouns));
  return insideCache.has(englishNoun.toLowerCase());
}
