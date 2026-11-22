import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

/**
 * Defects where the engine lost or misread data it had, found by the
 * 2026-11-22 pipeline audit. No grammar rule is added here: each test pins a
 * place where the code disagreed with itself.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (file: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', file), 'utf8')),
    lex,
    { orthography: 'standard' },
  );

describe('final punctuation', () => {
  it('is found behind a closing quote', () => {
    expect(result('en/he-asked-why-quoted.conllu').text).toMatch(/\?$/);
  });
});

describe('Russian "её" as a possessive', () => {
  // The parser lemmatises it "ее"; the curated entry is keyed "её".
  it('reaches the curated jejin', () => {
    expect(result('ru/ja-znaju-ejo-brata.conllu').text).toBe('Ja znaju jejinogo brata.');
  });
});

describe('a number in digits', () => {
  it('is kept as written and not counted as untranslated', () => {
    const t = result('en/the-train-leaves-at-9-15.conllu');
    const digits = t.words.filter((w) => /^\d/.test(w.surface));
    expect(digits.length).toBeGreaterThan(0);
    for (const w of digits) expect(w.validation).toBe('validated');
    expect(t.unknown.filter((u) => /^\d/.test(u))).toEqual([]);
  });
});

describe('a completive cue in the present', () => {
  // aspect.ts's own rule: a perfective present reads as a future, so an
  // English present is imperfective. "finally" ran first and overrode it.
  it('does not make the present perfective', () => {
    expect(result('en/i-finally-understand-you.conllu').text).toBe('Ja konečno razuměju vas.');
  });
  it('still makes a past perfective', () => {
    expect(result('en/she-already-read-the-book.conllu').text).toBe('Ona už pročitala knigu.');
  });
});

describe('the copula a Russian source omits', () => {
  // Same rule subjectNumber applies to a finite verb: two subjects joined by "and" are plural.
  it('is plural for subjects joined by "and"', () => {
    expect(result('ru/moj-brat-i-moja-sestra-vrachi.conllu').text).toBe('Moj brat i moja sestra sut lěkari.');
  });
});

describe('two purpose clauses', () => {
  // Each takes its own subject's person and number; the second used to copy the first's.
  it('agree each with their own subject', () => {
    expect(result('en/two-purpose-clauses.conllu').text).toBe(
      'Ona rabotaje, da byhmo my mogli odpočivati, i ja uču se, da by ona byla ščestliva.',
    );
  });
});

describe('negative concord', () => {
  // Only the indefinites switch to ni- (syntax page); "něžny" is not one.
  it('leaves an adjective that merely starts with ně- alone', () => {
    expect(result('en/he-is-not-tender.conllu').text).toBe('On ne jest něžny.');
  });
});

describe('a Russian first person plural under a conjunction', () => {
  // Steenbergen's Babel text keeps the main-clause verbs imperative ("budujmo",
  // "izdělajmo") and the subordinate one not ("da byhmo ne razprostranili se").
  it('is a future, not "let us", and keeps its reflexive', () => {
    const text = result('ru/babel-4.conllu').text;
    expect(text).toContain('sbudujmo sobě grad');
    expect(text).toContain('prědže než razsějemo se po');
  });
});

describe('a numeral counting nothing', () => {
  // "0. nula, 1. jedin (jedna, jedno), 2. dva (dvě), 3. tri" (numerals page).
  it('takes the citation form dva, not the dictionary\'s "(dvě)"', () => {
    expect(result('en/one-two-three.conllu').text).toBe('Jedin, dva, tri.');
  });
});

describe('a verb whose only candidates are nouns', () => {
  it('is kept and flagged, not written as the noun', () => {
    const t = result('en/i-miss-the-army.conllu');
    expect(t.text).toBe('Ja miss armiju.');
    expect(t.words.find((w) => w.sourceForm === 'miss')?.validation).toBe('untranslated');
  });
});

describe('a note in parentheses in a dictionary headword', () => {
  it('is not written out', () => {
    expect(result('en/tomorrow-we-will-attack-again.conllu').text).toBe('Zautra my budemo naskakati opet.');
  });
});

describe('English "no" before a noun', () => {
  // "nikoj, nijedin and nikaky „not a single, none”" (pronouns page), with ne on
  // the verb: "Ja uže nikogda ne budu čitati nijednu knigu!" (syntax page).
  it('is nijedin, not a second ne', () => {
    expect(result('en/there-are-no-heroes-in-war.conllu').text).toBe('Ne sut nijedni heroji v vojně.');
  });
});

describe('a "not" that a dictionary phrase takes in', () => {
  // "not good" is the dictionary's own nedobry ("bad, not good"); the
  // negation stage added a second ne: "ale ne nedobro".
  it('is not negated a second time', () => {
    expect(result('en/not-good-enough.conllu').text).toBe('Ono jest dobro, ale nedobro dostatočno.');
  });
});
