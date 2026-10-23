import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import {
  personalPronounLemma,
  personalPronounNumber,
} from '../../rules/src/pronouns.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * Two defects made every pronoun object wrong.
 *
 * The dictionary glosses oblique FORMS as entries - `jų` "her", `jego` "him",
 * `jih` "them" - which have no paradigm of their own, so inflecting them
 * returned the merged paradigm of every third-person pronoun and handed the
 * MASCULINE dative `njemu` back for "her".
 *
 * And the `n-` forms belong only after a preposition: "After a preposition, all
 * pronouns of the third person are preceded by n-: jego > do njego; jim > pri
 * njim". Nothing requested `PrepCase`, so the longest-form tie-break produced
 * the n- form everywhere.
 */
describe('personal pronouns', () => {
  it('inflects the nominative lemma the features identify, not the glossed form', () => {
    expect(out('i-see-her.conllu')).toBe('Ja vidžu ju.');
    expect(out('he-gave-her-his-book.conllu')).toContain('jej');
    // The bug: the masculine dative for a feminine pronoun.
    expect(out('he-gave-her-his-book.conllu')).not.toContain('njemu');
  });

  it('uses the plain form when there is no preposition', () => {
    expect(out('i-see-him.conllu')).toBe('Ja vidžu jego.');
    expect(out('i-see-them.conllu')).toBe('Ja vidžu jih.');
    expect(out('i-see-him.conllu')).not.toContain('njego');
  });

  it('uses the n- form after a preposition', () => {
    expect(out('i-go-with-him.conllu')).toContain('s njim');
    expect(out('he-talks-about-her.conllu')).toContain('o njej');
  });

  it('inflects first-person pronouns, which have no n- forms at all', () => {
    expect(out('she-gave-me-a-book.conllu')).toBe('Ona dala mně knigu.');
  });

  it('maps features to lemmas rather than trusting the English lemma', () => {
    // Stanza lemmatises "her" to "her", never to "she".
    expect(personalPronounLemma({ PronType: 'Prs', Person: '3', Number: 'Sing', Gender: 'Fem' })).toBe('ona');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '3', Number: 'Sing', Gender: 'Masc' })).toBe('on');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '3', Number: 'Sing', Gender: 'Neut' })).toBe('ono');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '3', Number: 'Plur' })).toBe('oni');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '1', Number: 'Sing' })).toBe('ja');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '1', Number: 'Plur' })).toBe('my');
  });

  it('leaves possessives and reflexives to their own rules', () => {
    expect(personalPronounLemma({ PronType: 'Prs', Person: '3', Poss: 'Yes' })).toBeNull();
    expect(personalPronounLemma({ PronType: 'Prs', Person: '1', Reflex: 'Yes' })).toBeNull();
    expect(personalPronounLemma({ PronType: 'Int', Person: '3' })).toBeNull();
  });
});

/**
 * "Interslavic has got T-V distinction, i.e. vy is a universal second person
 * pronoun for both numbers, whereas the second person singular ty is used only
 * for addressing friends, relatives and children."
 * http://steen.free.fr/interslavic/pronouns.html
 *
 * English marks neither number nor register on "you", so `ty` would assert an
 * intimacy the source does not contain.
 */
describe('the T-V distinction', () => {
  it('translates "you" as vy, whatever the number', () => {
    expect(personalPronounLemma({ PronType: 'Prs', Person: '2' })).toBe('vy');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '2', Number: 'Sing' })).toBe('vy');
    expect(personalPronounLemma({ PronType: 'Prs', Person: '2', Number: 'Plur' })).toBe('vy');
  });

  it('inflects vy as the plural it is', () => {
    // `vy` has no singular, so copying the English word's unmarked number asked
    // for a form that does not exist and fell back to the nominative "vy".
    expect(personalPronounNumber('vy')).toBe('Plur');
    expect(out('i-see-you.conllu')).toBe('Ja vidžu vas.');
  });

  it('agrees the verb with vy in the plural', () => {
    expect(out('you-see-me.conllu')).toBe('Vy vidite mene.');
  });
});

describe('verb number comes from the subject', () => {
  it('makes a plural nominal subject take a plural verb', () => {
    // English leaves "read" unmarked, so reading the verb's own features made
    // this singular.
    expect(out('the-women-read-books.conllu')).toBe('Ženy pročitali knigy.');
  });

  it('leaves a singular subject singular', () => {
    expect(out('woman-read-book.conllu')).toBe('Žena pročitala knigu.');
  });
});
