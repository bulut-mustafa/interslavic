import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const out = (name: string) => result(name).text;

/**
 * English "one" standing in for a noun already mentioned has no Interslavic
 * counterpart - the modifier stands on its own, as van Steenbergen writes it:
 * "uznati za silnějšego od drugogo", "Jedni ljudi prědpočitajut lěto, drugi
 * zimu". Translating the word gave a numeral instead.
 */
describe('the placeholder "one"', () => {
  it('is dropped, leaving the modifier', () => {
    // Was "než ta jedna" and "Ja hoču črveny jedin".
    expect(out('more-interesting-than-that-one.conllu')).toBe(
      'Tuta kniga jest vyše interesna než ta.',
    );
  });

  it('gives the modifier the gender of the noun it stands for', () => {
    // `ta`, not `toj`: it stands for "kniga", which is feminine.
    expect(out('more-interesting-than-that-one.conllu')).toContain('než ta');
  });

  it('falls back to the unmarked masculine with no antecedent', () => {
    // "I want the red one" names no noun at all, and English carries no
    // gender, so the modifier takes the same default a predicate would.
    expect(out('i-want-the-red-one.conllu')).toBe('Ja hoču črveny.');
  });

  it('shows its decision on the modifier, since "one" itself is not emitted', () => {
    const gender = (name: string, surface: string) =>
      result(name).words.find((w) => w.surface === surface)?.features.find((f) => f.name === 'Gender');
    expect(gender('more-interesting-than-that-one.conllu', 'ta')).toMatchObject({
      value: 'Fem', ruleId: 'anaphora.one', confidence: 'high',
    });
    // The default is reported as a default, not laundered into a certainty.
    expect(gender('i-want-the-red-one.conllu', 'črveny')).toMatchObject({
      value: 'Masc', ruleId: 'anaphora.one', confidence: 'default',
    });
  });

  it('says why the word is gone', () => {
    const why = result('i-want-the-red-one.conllu').dropped.map((d) => d.why).join(' ');
    expect(why).toContain('placeholder noun');
  });

  it('leaves the real numeral "one" alone', () => {
    // A counting "one" takes no determiner or adjective of its own.
    expect(out('i-have-one-sister.conllu')).toBe('Ja imaju jednu sestru.');
  });

  it('leaves "one of them" alone, which is the numeral with a partitive', () => {
    // The numeral survives; its gender is now the headword's own (jedin)
    // rather than a tie-break's.
    expect(out('one-of-them-is-broken.conllu')).toMatch(/^Jedin /);
  });

  it('keeps the word when only an article would be left', () => {
    // An article is deleted too, so dropping "one" as well left "I am the one"
    // as the bare "Ja jesm" - the sentence lost its predicate entirely.
    expect(out('i-am-the-one.conllu')).not.toBe('Ja jesm.');
  });

  it('takes the NEAREST preceding noun as the antecedent', () => {
    // "My brother's book": `kniga` is feminine and `brat` masculine, so
    // reading the first noun instead of the last would give "než toj".
    expect(out('brothers-book-than-that-one.conllu')).toContain('než ta');
  });
});
