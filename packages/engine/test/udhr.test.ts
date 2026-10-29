import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

/**
 * What a real parallel text found. Article 1 of the Universal Declaration of
 * Human Rights exists in van Steenbergen's own Interslavic (credited "IJzeren
 * Jan", https://cals.no/translation/udhr-art-1/language/interslavic) and in the
 * official UN English and Russian - the one pair set where neither side was
 * written for this repo. The Lord's Prayer was tried too; its Church-style
 * Russian mostly defeats the parser, but it surfaced the punctuation and the
 * possessive below.
 *
 * The gold pairs (g50, g51 and their -ru mirrors) still differ in word choice
 * and in one construction, so each fix is asserted here on its own: a gold pair
 * that is excused cannot catch a regression.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

describe('UDHR Article 1, from Russian', () => {
  it('"Все" is the universal vėś, not cěly "whole"', () => {
    // pronouns page: "ves (f. vsa, n. vse "whole, entire; all")", plural vsi
    expect(out('gold/g50-ru.conllu')).toMatch(/^Vsi ljudi /);
  });

  it('puts an adjective complement in the nominative, agreeing with the subject', () => {
    // Russian "свободными и равными" is instrumental; he writes "svobodni i råvni".
    expect(out('gold/g50-ru.conllu')).toContain('rodet se svobodni i ravni');
  });

  it('supplies the copula a short passive participle needs', () => {
    // verbs page: the passive is "a form of the verb byti" + a passive participle
    expect(out('gold/g51-ru.conllu')).toMatch(/^Oni sut obdarjeni /);
  });

  it('agrees a second predicate with the subject of the first', () => {
    // "dolžni", animate like "oni" - not "dolžne"
    expect(out('gold/g51-ru.conllu')).toContain(' i dolžni postupati');
  });

  it('translates "друг друга" as the dictionary\'s jedin drugogo', () => {
    expect(out('gold/g51-ru.conllu')).toContain('jedin drugogo');
    expect(out('gold/g51-ru.conllu')).not.toContain('prijatelj');
  });
});

describe('UDHR Article 1, from English', () => {
  it('reads "human beings" as the one noun člověk, plural ljudi', () => {
    expect(out('gold/g50.conllu')).toMatch(/^Vsi ljudi /);
  });

  it('reads "be born" as roditi sę, finite, not a passive of "bear"', () => {
    expect(out('gold/g50.conllu')).toContain('ljudi rodet se svobodni i ravni');
  });

  it('takes pravo "law, right" for "rights", not the political pravica', () => {
    expect(out('gold/g50.conllu')).toContain('i pravah');
  });

  it('translates "should" with imati, as he does', () => {
    expect(out('gold/g51.conllu')).toContain('imajut postupati');
  });

  it('agrees a participle with oni as masculine animate', () => {
    expect(out('gold/g51.conllu')).toMatch(/^Oni sut obdarjeni /);
  });
});

describe('found through the Lord\'s Prayer', () => {
  it('declines an adjective in a slot that marks no gender', () => {
    // Dat Plur Masc Anim matched no form - the dative plural has no Gender -
    // and the citation form came out: "dolžnikam naš".
    expect(out('ru/proshchaem-dolzhnikam.conllu')).toBe('My proščajemo dolžnikam našim.');
  });

  it('keeps the soil zemja for a lowercase source, not the planet Zemja', () => {
    expect(out('ru/volja-na-zemle.conllu')).toBe('Volja tvoja jest na zemji.');
  });

  it('carries a semicolon over like a comma', () => {
    expect(out('ru/chitaet-pishet.conllu')).toBe('On čitaje; ona piše.');
  });

  it('does not read an objectless "пишет" as pišati "pee"', () => {
    expect(out('ru/chitaet-pishet.conllu')).not.toContain('piša');
  });
});

/**
 * Van Steenbergen's North Wind and the Sun (http://steen.free.fr/interslavic/northwind.html)
 * against the standard English text: gold g52-g56. A free translation, so the
 * pairs do not match, and these assert the parts that are now right.
 */
describe('The North Wind and the Sun, from English', () => {
  it('makes a verb plural for subjects joined by "and"', () => {
    // "Sěverny Větr i Solnce sporili se" - was the singular "osparjal"
    expect(out('gold/g52.conllu')).toContain('i solnce osparjali');
  });

  it('finds a word the dictionary spells the other way', () => {
    // "traveler"; the dictionary has "traveller"
    expect(out('en/he-is-a-traveler.conllu')).toBe('On jest putujuči.');
  });

  it('translates a modal whose verb is left out', () => {
    // "as hard as he could" - he writes "kako mogl"
    expect(out('gold/g54.conllu')).toContain('kak on mogl,');
  });

  it('reads "at last" as the adverb nakonec', () => {
    expect(out('gold/g54.conllu')).toContain('i nakonec ');
  });

  it('forms a missing -ly adverb as its adjective\'s neuter singular', () => {
    expect(out('en/sun-shined-warmly.conllu')).toContain('světilo teplo');
  });

  it('keeps the passive "be" an infinitive after a modal', () => {
    expect(out('gold/g53.conllu')).toContain('imaje byti razvaženy');
  });
});

/**
 * His Tower of Babel is a retelling, not a translation of the Synodal text, so
 * it is not gold; its verses went through as the Lord's Prayer did, to find
 * defects. (The verbs Stanza mis-lemmatised - "смешаем" as "смесать",
 * "обожжем" as "обождать" - and "сойдем" tagged 2nd person are the parser's.)
 */
describe('the Tower of Babel, from Russian', () => {
  it('keeps the person a subjectless Russian verb states', () => {
    // "И сказали они: построим ... и сделаем" - first person, not "sbudujut"
    expect(out('ru/babel-4.conllu')).toContain('sbudujemo sobě grad');
    expect(out('ru/babel-4.conllu')).toContain('sdělajemo sobě ime');
  });

  it('builds the reciprocal in any case, masculine like the formula', () => {
    // "друг другу" - he writes "jedin k drugomu"; was "prijatelj prijatelju"
    expect(out('ru/babel-3.conllu')).toContain('skazali jedin drugomu');
  });

  it('gives a standalone "один" the gender the source marks', () => {
    // "так чтобы один не понимал" - was "jedna"
    expect(out('ru/babel-7.conllu')).toContain('aby jedin ne razuměl');
  });

  it('takes the plain demonstrative for "того"', () => {
    // pronouns page: "The primary demonstrative pronoun is toj"; was "tamtogo"
    expect(out('ru/babel-6.conllu')).toContain('od togo,');
  });
});

/**
 * Constructions his texts use, built from them and from the Interslavic
 * Wikipedia's counts.
 */
describe('constructions from his texts', () => {
  it('puts the preposition inside the reciprocal: "jedin k drugomu"', () => {
    // UDHR "imajųt postųpati jedin k drugomu", Babel "govorili jedin k drugomu"
    expect(out('gold/g51.conllu')).toContain('imajut postupati jedin k drugomu v duhu bratstva');
  });

  it('builds "the more ..., the more ..." as "čim ..., tym ..."', () => {
    // North Wind "čim močněje on dul, tym bolje"
    expect(out('gold/g54.conllu')).toContain('čim vyše on vějal, tym vyše');
  });

  it('makes "the one who" the demonstrative and kto', () => {
    // North Wind "togo, kto prvy uspěje"; Wikipedia "toj, kto", "tyh, kto"
    expect(out('gold/g53.conllu')).toContain('že toj, kto ');
  });

  it('makes a partitive "of" iz with the genitive', () => {
    // "silnějše iz njih dvoh"; 142 "jedin iz" in the Interslavic Wikipedia
    expect(out('en/one-of-them-is-broken.conllu')).toBe('Jedin iz njih jest lamany.');
    expect(out('gold/g56.conllu')).toContain('silnějše iz dvoh');
  });
});
