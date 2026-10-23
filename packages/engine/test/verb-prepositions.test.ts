import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { GOVERNED_PAIRS, isTimeUnit, verbGovernedPhrase } from '../../rules/src/verb-prepositions.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * English "for" was always `dlja`, the frequency leader among the dictionary's
 * "for" senses - and the benefactive one. Every occurrence in van Steenbergen's
 * own prose takes a beneficiary ("dlja mene", "dlja sebe", "dlja ženy i
 * dětij"), and the prepositions page lists no temporal sense for it, so a span
 * of time was being read as something the action was done on behalf of.
 */
describe('a span of time takes no preposition', () => {
  it('drops the preposition and uses the accusative', () => {
    // Was "Oni žili tu dlja deset rokov". `deset` governs the genitive plural
    // of the noun it counts, which is why the noun is still "rokov".
    expect(out('lived-for-ten-years.conllu')).toBe('Oni žili tu deset rokov.');
    expect(out('waited-for-an-hour.conllu')).toBe('Ja jesm čekal časinu.');
  });

  it('leaves a benefactive "for" alone', () => {
    expect(out('gift-for-my-mother.conllu')).toContain('dlja mojej matere');
  });

  it('recognises time units and nothing else', () => {
    for (const w of ['hour', 'Year', 'week', 'moment']) expect(isTimeUnit(w), w).toBe(true);
    for (const w of ['mother', 'train', 'reason', 'God']) expect(isTimeUnit(w), w).toBe(false);
  });
});

/**
 * Some verbs choose the preposition themselves and the English one is no
 * guide. Each pair is attested in the Interslavic Wikipedia; see the table in
 * packages/rules/src/verb-prepositions.ts for the quotations.
 */
describe('verb-governed prepositions', () => {
  it('uses "na" for "wait for", not the benefactive "dlja"', () => {
    // Was "My čekajemo dlja pojezda" - waiting on the train's behalf.
    expect(out('waiting-for-the-train.conllu')).toBe('My čekajemo na pojezd.');
  });

  it('uses the accusative after "věriti v", not the locative', () => {
    // Was "Ja věrju v bogu" - the locative, as if God were a place.
    expect(out('believe-in-god.conllu')).toBe('Ja věrju v boga.');
  });

  it('cites evidence for every pair in the table', () => {
    expect(GOVERNED_PAIRS.length).toBeGreaterThan(0);
    for (const pair of GOVERNED_PAIRS) {
      const [verb, prep] = pair.split('|') as [string, string];
      const g = verbGovernedPhrase(verb, prep);
      expect(g, pair).not.toBeNull();
      expect(g!.evidence.length, pair).toBeGreaterThan(20);
      expect(g!.why.length, pair).toBeGreaterThan(20);
    }
  });

  it('does not fire for a verb outside the table', () => {
    expect(verbGovernedPhrase('look', 'for')).toBeNull();
    expect(verbGovernedPhrase('wait', 'in')).toBeNull();
  });
});

/**
 * A nominal governed by a preposition is not the predicate - the prepositional
 * phrase is. UD makes the noun inside it the root of a copular sentence, so
 * predicate agreement was overwriting both the case the preposition governs and
 * the noun's own lexical gender.
 */
describe('predicate agreement stops at a preposition', () => {
  it('keeps the case and gender of a preposition-governed nominal', () => {
    // Was "dlja mojej mati": the nominative of a masculine predicate, agreed
    // with the subject "dar", so the noun never inflected at all.
    expect(out('gift-for-my-mother.conllu')).toBe('Tutoj dar jest dlja mojej matere.');
  });
});

/**
 * A bare adverbial of time is in the accusative. Found from a real comparison:
 * "I cook pumpkin every day" was right only by accident, because `denj` is
 * masculine inanimate and its accusative equals its nominative. The case was
 * actually a nominative at `guess` confidence, and "every night" exposed it.
 *
 *   "amerikansky prezident načal KAŽDU SEDMICU posylati radio soobčenje"
 *   https://incubator.wikimedia.org/wiki/Wp/isv
 */
describe('an adverbial of time', () => {
  it('is accusative, which only shows on a feminine noun', () => {
    // Was "každa noč" - the nominative.
    expect(out('read-a-book-every-night.conllu')).toContain('každu noč');
  });

  it('is unchanged where the accusative equals the nominative', () => {
    expect(out('cook-pumpkin-every-day.conllu')).toBe('Ja kuhaju tykvu každy denj');
  });

  it('leaves a time phrase with its own preposition alone', () => {
    // "in a week" is governed by `v`, which decides the case itself.
    expect(out('come-in-a-week.conllu')).toContain('v tydnju');
  });
});
