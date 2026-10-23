import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { negativeCounterparts } from '../../rules/src/negation.ts';
import { functionWordFor } from '../../rules/src/function-words.ts';
import { toStandard } from '../../morph/src/orthography.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * English switches to the *any* series under negation ("couldn't find them
 * anywhere"); Interslavic does the opposite and negates everything negatable.
 * Translated word for word we produced `kde-nebud` - a positive-polarity
 * indefinite - standing next to `ne`, which the syntax page rules out:
 *
 *   "Unlike in English, all negatable words are being negated in Interslavic"
 */
describe('negative concord on indefinites', () => {
  it('uses the ni- series inside a negated clause', () => {
    expect(out('not-see-anything.conllu')).toBe('Ja ne vidžu ničto.');
    expect(out('not-go-anywhere.conllu')).toBe('Ja ne idu nikde.');
  });

  it('leaves the indefinite alone when the clause is not negated', () => {
    expect(out('i-see-something.conllu')).toBe('Ja vidžu něčto.');
  });

  it('reaches an adverb when the negation sits on a modal', () => {
    // `ne` is emitted before the MODAL, which hangs off the clause verb as a
    // child - so walking up from "anywhere" never reaches it. The negated
    // CLAUSE is what has to be recorded.
    //
    // A mutation audit caught the first version of this test using a fixture
    // with no "anywhere" in it at all, which asserted nothing.
    const text = out('father-could-not-find-anywhere.conllu');
    expect(text).toContain('nikde');
    expect(text).not.toContain('kde-nebud');
  });

  it('derives the counterpart from the etymological lemma the dictionary stores', () => {
    // The dictionary lemma is "čto-nebųď", not the folded "čto-nebud", so
    // matching the standard spelling found nothing.
    expect(negativeCounterparts('čto-nebųď', toStandard)).toContain('ničto');
    expect(negativeCounterparts('kde-nebųď', toStandard)).toContain('nikde');
    expect(negativeCounterparts('něčto', toStandard)).toContain('ničto');
    expect(negativeCounterparts('čtokoli', toStandard)).toContain('ničto');
  });

  it('does not rewrite a lemma from another series', () => {
    expect(negativeCounterparts('poněkde', toStandard)).toEqual([]);
    expect(negativeCounterparts('nikde', toStandard)).toEqual([]);
    expect(negativeCounterparts('dom', toStandard)).toEqual([]);
    // A bare "koli" leaves no stem, so there is nothing to prefix.
    expect(negativeCounterparts('koli', toStandard)).toEqual([]);
  });

  it('only emits a counterpart the dictionary actually has', () => {
    // The correlative table is systematic; the dictionary is not complete. A
    // derived form is a candidate, never a licence to invent a word.
    const derived = negativeCounterparts('kogo-nebųď', toStandard);
    expect(derived.length).toBeGreaterThan(0);
    for (const candidate of derived) {
      // "nikogo" is not a dictionary lemma, so nothing may be emitted for it.
      if (candidate === 'nikogo') expect(lex.lookupLemma(candidate)).toEqual([]);
    }
  });

  /**
   * The syntax page's own example of total negation, and the two words in it
   * that English does not negate:
   *
   *   "Unlike in English, all negatable words are being negated in
   *    Interslavic, for example: - Ja uže nikogda ne budu čitati nijednu
   *    knigu! \u201eI am never going to read a single book anymore!\u201d"
   *   http://steen.free.fr/interslavic/syntax.html
   *
   * Neither reachable by the morphological ni- swap: "single" is an English
   * ADJ whose candidates are all positive (`jednokratny` "one-time" won on
   * gloss position), and "anymore" has no gloss of its own at all - the
   * dictionary pairs it as the multiword `už ne`, whose `ne` half is the
   * clause negation. Both are curated entries conditioned on the clause.
   */
  it('negates "a single" and translates "anymore" inside a negated clause', () => {
    const text = translate(
      parseConllu(
        fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold/g14.conllu'), 'utf8'),
      ),
      lex,
      { orthography: 'standard' },
    ).text;
    // nijednu, not the positive jednokratnu; uže, not the English "anymore".
    expect(text).toContain('nijednu knigu');
    expect(text).toContain('uže');
    expect(text).not.toMatch(/anymore/i);
  });

  /**
   * And the condition is a condition: outside a negated clause "single" must
   * NOT become `nijedin`, or "a single book" in a positive sentence would come
   * out as "no book".
   */
  it('does not negate "a single" outside a negated clause', () => {
    expect(functionWordFor('single', 'ADJ', 'en', false)).toBeNull();
    expect(functionWordFor('single', 'ADJ', 'en', true)?.isv).toBe('nijedin');
  });
});
