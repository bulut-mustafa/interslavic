import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { compared } from '../../morph/src/comparison.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * `Degree` was never read, so "bigger" and "biggest" both came out as the plain
 * positive - the comparison was dropped from the translation entirely. The
 * library had the forms all along; `derive()` was never called anywhere.
 */
describe('comparatives and superlatives', () => {
  it('builds the synthetic comparative', () => {
    expect(out('i-see-a-bigger-house.conllu')).toBe('Ja vidžu večši dom.');
    expect(out('this-house-is-bigger.conllu')).toBe('Tutoj dom jest večši.');
  });

  it('builds the superlative as naj- plus the comparative', () => {
    // The page allows naj- + positive ("najveliky") only "as a means of
    // simplification"; naj- + comparative is the rule.
    expect(out('biggest-house.conllu')).toBe('Tutoj jest največši dom.');
    expect(out('he-is-the-best.conllu')).toBe('On jest najlěpši.');
  });

  it('uses the irregular comparatives the page lists', () => {
    // dobry > lěpši, maly > menši, veliky > večši
    expect(compared('dobry', 'adj.', 'Cmp')).toBe('lěpši');
    expect(compared('maly', 'adj.', 'Cmp')).toBe('menši');
    expect(out('smaller-car.conllu')).toContain('menši');
  });

  it('declines the comparative, which is a lemma of its own', () => {
    // "večši dom" is nominative; an accusative animate would be "večšego".
    expect(out('i-see-a-bigger-house.conllu')).toContain('večši');
  });

  it('derives adverbial comparatives too', () => {
    expect(compared('dobro', 'adv.', 'Cmp')).toBe('lěpje');
    expect(compared('novo', 'adv.', 'Cmp')).toBe('nověje');
  });

  it('returns nothing for an adjective that has no comparative', () => {
    // Relational adjectives genuinely have none - "more Abkhaz" is meaningless -
    // and the library is right to refuse.
    expect(compared('abhazsky', 'adj.', 'Cmp')).toBeNull();
  });
});

/**
 * A predicate adjective must have a gender, and some subjects supply none:
 * "I"/"you" carry no gender in English, and an untranslated proper noun has no
 * dictionary entry to read one from. Left unset, the form fell out of a
 * tie-break and came back FEMININE.
 */
describe('predicate gender', () => {
  it('agrees with a pronoun subject', () => {
    expect(out('he-is-the-best.conllu')).toBe('On jest najlěpši.');
    expect(out('she-is-the-best.conllu')).toBe('Ona jest najlěpša.');
  });

  it('defaults to the masculine when the subject has no gender', () => {
    expect(out('i-am-happy.conllu')).toBe('Ja jesm ščestlivy.');
  });

  it('still agrees when the subject is untranslated', () => {
    // "Peter" has no dictionary entry; skipping the block left "ščestliva".
    expect(out('peter-is-happy.conllu')).toBe('Peter jest ščestlivy.');
  });

  it('keeps taking the gender from a noun subject when there is one', () => {
    expect(out('water-is-cold.conllu')).toBe('Voda jest zimna.');
  });
});
