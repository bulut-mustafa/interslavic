import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { pastPassiveParticiple } from '../../morph/src/participles.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const validator = buildFullFormIndex(lex);
const read = (dir: string, name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', dir, name), 'utf8'));
const out = (name: string) => translate(read('en', name), lex, { orthography: 'standard' }).text;
const outGold = (name: string) => translate(read('gold', name), lex, { orthography: 'standard' }).text;

/**
 * The passive came out as the literary imperfect of "to be" plus the ACTIVE
 * l-participle, with the agent as "od strany" ("on the part of"):
 *
 *   was:  Koja žena běše ljubila od strany togo muža?
 *   page: Koja žena jest ljubjena od togo muža?
 *
 * The page states the agent rule outright: "The agent in passive construction
 * is either in the instrumental case or preceded by the preposition od with the
 * genitive."
 */
describe('the passive', () => {
  it('reproduces the page\'s own passive sentence', () => {
    expect(outGold('g12.conllu')).toBe('Koja žena jest ljubjena od togo muža?');
  });

  it('agrees the participle with the subject', () => {
    expect(out('book-is-read-by.conllu')).toBe('Kniga jest čitana od ženy.');
    expect(out('books-are-read-by.conllu')).toBe('Knigy sut čitane od ženy.');
  });

  it('keeps the copula, which carries the tense', () => {
    // The passive "be" is `aux:pass`, which was being deleted as a progressive.
    expect(out('pizza-is-made.conllu')).toBe('Pica jest dělana.');
  });

  it('uses "od" + genitive for the agent, not "od strany"', () => {
    expect(out('book-is-read-by.conllu')).toContain('od ženy');
    expect(out('book-is-read-by.conllu')).not.toContain('strany');
  });

  it('derives the PAST passive participle, not the present one', () => {
    // prpp ("dělajemy") is a different construction from pfpp ("dělany").
    expect(pastPassiveParticiple('dělati', 'v.tr. ipf.')).toBe('dělany');
    expect(pastPassiveParticiple('ljubiti', 'v.tr. ipf.')).toBe('ljubjeny');
  });

  it('validates the participle against the full-form lexicon', () => {
    // Derived forms were absent from the index, so every correct participle and
    // comparative was reported as unvalidated - teaching the reader to distrust
    // the right answer.
    expect(validator.has('ljubjena')).toBe(true);
    expect(validator.has('večši')).toBe(true);
    expect(validator.has('najlěpši')).toBe(true);
  });
});

/**
 * `ne` is emitted at the top of the realisation loop, because several branches
 * return early and each of them silently dropped the negation.
 */
describe('negation survives every realisation path', () => {
  it('keeps `ne` on a negated future', () => {
    // Was "Ja nikogda budu čitati..." - the opposite of what was asked.
    expect(outGold('g14.conllu')).toContain('ne budu');
  });

  it('keeps `ne` when the verb is not in the dictionary', () => {
    const text = out('not-blargify.conllu');
    expect(text).toContain('ne ');
    expect(text).toContain('blargify');
  });
});

/**
 * Transitivity is only evidence in an ACTIVE clause. Found by translating the
 * same 30 meanings from English and from Russian and comparing: Russian gave
 * "Jeda byla prigotovjena mojeju baboju" while English gave "Jeda byla sbirati
 * se od mojej baby" - an infinitive reflexive where a participle belongs.
 *
 * A passive has no direct object because the patient was promoted to subject,
 * not because the verb is intransitive, so the `hasDirectObject` signal was
 * penalising every `v.tr.` candidate: `gotoviti` (v.tr., freq 5016) lost to
 * `sbirati sę` (v.refl., freq 4840).
 */
describe('a passive clause and verb transitivity', () => {
  it('does not read the missing object as intransitivity', () => {
    expect(out('food-was-prepared.conllu')).toBe('Jeda byla prigotovjena od mojej baby.'); // past passive: perfective, as the active
  });

  /**
   * A REDUCED passive has no subject of its own: "the food prepared by my
   * grandmother" is an `acl` participle whose only passive marking is
   * `Voice=Pass`. That is why the voice feature is checked as well as
   * `nsubj:pass` - measured, after removing it changed nothing across 126
   * English and 40 Russian sentences and looked redundant.
   */
  it('detects a reduced passive, where Voice is the only signal', () => {
    const text = out('ate-food-prepared.conllu');
    expect(text).toContain('gotovjen');
    expect(text).not.toContain('sbirati');
  });

  it('still uses transitivity in an ACTIVE clause', () => {
    // The rule this guards is the one that picks a departure verb for an
    // objectless "leave" rather than `ostavjati` ("abandon").
    expect(out('leave-before-midnight.conllu')).not.toContain('ostavjati');
    expect(out('he-left-his-keys.conllu')).toContain('ostavil');
  });
});
