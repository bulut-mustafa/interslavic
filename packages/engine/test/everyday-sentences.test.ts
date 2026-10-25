import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

/**
 * Ordinary modern sentences, from Tatoeba (https://tatoeba.org, CC BY 2.0 FR):
 * three batches of 25-30 Interslavic sentences with human English or Russian
 * translations, drawn at random. Each test names the Tatoeba sentence IDs
 * (source / Interslavic). The Interslavic there is community-written, so it
 * was read as evidence of usage, not copied as a target: these tests assert
 * the general patterns the batches exposed, each checked against the grammar
 * pages or, where they are silent, against how Tatoeba and van Steenbergen's
 * own texts write it.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

describe('a subject that only presents a noun is "to"', () => {
  it('for English "it" (12989674)', () => {
    // Tatoeba 12989674: "It's a beautiful poem." -> "To jest krasiva poema."
    expect(out('en/tatoeba-beautiful-poem.conllu')).toBe('To jest krasiva poema.');
  });

  it('for English "this"', () => {
    // "This is a rhinoceros" is "To jest nosorog" there; never "Tutoj jest".
    expect(out('en/biggest-house.conllu')).toBe('To jest največši dom.');
  });

  it('for Russian "это" (10119367 / 13507106)', () => {
    expect(out('ru/tatoeba-krasivoe-zhivotnoe.conllu')).toBe('To jest krasiva životina.');
  });
});

describe('verb complements and imperatives', () => {
  it('makes an "-ing" complement an infinitive (13467017)', () => {
    // he writes "prěstali budovati" (Babel), Tatoeba "Ljubju ničego ne dělati"
    expect(out('en/tatoeba-love-doing-nothing.conllu')).toContain('ljubju ne dělati');
  });

  it('treats "don\'t X" as an imperative (13495883 / 13512024)', () => {
    expect(out('en/tatoeba-tell-dont-show.conllu')).toBe('Kažite, ne pokazyvajte.');
    expect(out('en/dont-open-the-window.conllu')).toBe('Ne otvarjajte okno.');
  });

  it('does not read "let me" as "let us" (13824014)', () => {
    // "Let me know" was "Znajmo", "let's know". The right construction is not
    // yet built (only one Tatoeba example), but the wrong one is gone.
    expect(out('en/tatoeba-let-me-know.conllu')).not.toMatch(/^Znajmo/);
  });
});

describe('the copula', () => {
  it('is not said twice after "will" (13054713 / 13850534)', () => {
    expect(out('en/tatoeba-ill-be-outside.conllu')).toContain('ja budu vně');
  });

  it('is future for a Russian "буду", which the parser tags present (5674275)', () => {
    expect(out('ru/tatoeba-budu-s-toboj.conllu')).toBe('Ja budu s toboju.');
  });

  it('is neuter in an impersonal Russian past (13522962)', () => {
    expect(out('ru/tatoeba-bylo-holodno.conllu')).toBe('Dnes bylo velmi zimno.');
  });

  it('follows a fronted phrase and the subject (6907250)', () => {
    expect(out('ru/tatoeba-v-indii-korovy.conllu')).toMatch(/^V Indiji kravy sut /);
  });

  it('takes the negation when the predicate is negated (4969191)', () => {
    // syntax page: "Tuto avto ne jest drago"
    expect(out('ru/tatoeba-my-ne-idioty.conllu')).toBe('My ne jesmo idioti.');
  });
});

describe('pronouns and possessives', () => {
  it('does not make a possessive inside the subject reflexive', () => {
    expect(out('en/his-brother-is-tall.conllu')).toBe('Jego brat jest vysoky.');
  });

  it('takes the possessive "jej", not the personal pronoun (12523895)', () => {
    // UD's PronType "Prs" never matched the dictionary's "pers"/"poss", and the
    // personal jej's nominative is "ona": "Ona baba". The possessive jej does
    // not decline ("jego, jej, jih. These forms are not inflected").
    expect(out('en/tatoeba-her-grandmother.conllu')).toMatch(/^Jej baba i moja baba /);
  });

  it('gives "everything" the neuter its headword is (12672759)', () => {
    expect(out('en/tatoeba-almost-everything.conllu')).toContain('kupil skoro vse ');
  });

  it('keeps "всём" neuter and locative, and finds a short adjective (13509804)', () => {
    expect(out('ru/tatoeba-vo-vsem-prav.conllu')).toBe('Том byl v vsem pravy.');
  });

  it('reads "no one" as nikto, negating the verb once (10101206)', () => {
    expect(out('en/tatoeba-no-one-loves.conllu')).toMatch(/^Nikto ne ljubi /);
  });

  it('does not translate the name "Том" as "том", a volume (13001945)', () => {
    expect(out('ru/tatoeba-starshe-toma.conllu')).toContain('od Тома');
  });
});

describe('noun modifiers', () => {
  it('makes an English noun modifier an adjective', () => {
    // he writes "Sěverny Větr"; was two nouns, "sěver větr"
    expect(out('gold/g52.conllu')).toMatch(/^Sěverny větr i solnce /);
  });
});

describe('the fourth batch', () => {
  it('makes "to be" and "can be" the infinitive byti (13522870)', () => {
    expect(out('en/tatoeba-good-artist-too.conllu')).toContain('hoču byti dobry');
    expect(out('en/she-can-be-happy.conllu')).toBe('Ona može byti ščestliva.');
  });

  it('reads "too" as "also" unless it modifies an adjective or adverb', () => {
    // dictionary: takože "also, too, as well"; zamnogo "too" (nl "te veel")
    expect(out('en/tatoeba-good-artist-too.conllu')).toMatch(/takože\.$/);
    expect(out('en/house-is-too-big.conllu')).toBe('Dom jest zamnogo veliky.');
  });

  it('finds "at home" as doma even with a comma after it (13495993)', () => {
    expect(out('en/tatoeba-at-home-dutch.conllu')).toMatch(/^Doma, /);
  });
});
