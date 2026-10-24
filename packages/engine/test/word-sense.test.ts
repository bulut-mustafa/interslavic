import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon, rank } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { femaleEquivalentsOf, isFemaleEquivalent } from '../../rules/src/derivation.ts';
import { functionWordFor } from '../../rules/src/function-words.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;
const gold = (id: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold', `${id}.conllu`), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * The dictionary marks narrower senses with a parenthesised label - `prati` is
 * "wash (clothes), launder" while `myti` is plain "wash" - but `normalizeGloss`
 * strips the label before indexing, so both became the key "wash" and frequency
 * (5365 vs 5221) picked the laundry verb for every "wash".
 *
 * A flat penalty for a labelled sense was MEASURED AND REJECTED first: because
 * frequency is only consulted when scores tie, one penalty point overrode a
 * 10,000-point frequency gap and flipped 119 gloss keys, many wrongly. What
 * ships is a discount on frequency, and only when the source gives no support
 * for the label. See docs/verification-log.md.
 */
describe('sense labels', () => {
  it('prefers the unlabelled sense when nothing supports the label', () => {
    expect(out('i-wash-myself.conllu')).toBe('Ja myju se.');
  });

  it('prefers the labelled sense when the source supports it', () => {
    // "clothes" is in the sentence, so "wash (clothes)" is the better match.
    expect(out('i-wash-the-clothes.conllu')).toContain('peru');
  });

  it('applies to nouns as well as verbs', () => {
    // potok is "flood (tears etc.)"; potop is the flood of water.
    expect(out('i-see-the-flood.conllu')).toContain('potop');
  });

  it('does not let the discount override a clear frequency gap', () => {
    // "doctor (physician)" is labelled, but far more frequent than the
    // alternatives, so it must still win. This is the case that a flat penalty
    // got wrong, handing "doctor" to the feminine "lěkaŕka".
    expect(out('he-is-a-doctor.conllu')).toContain('doktor');
  });
});

/**
 * The word-formation page calls these forms the "female equivalent of male
 * persons", which makes the masculine the base. English "doctor"/"teacher" mark
 * no gender, so they must select the base - but `lěkaŕka` and `učiteljka`
 * compete for the same gloss and can win on frequency.
 */
describe('female equivalents are the marked member', () => {
  it('derives the forms the page documents', () => {
    expect(femaleEquivalentsOf('prijatelj')).toContain('prijateljka');
    expect(femaleEquivalentsOf('radnik')).toContain('radnica'); // -nik > -nica
    expect(femaleEquivalentsOf('Albanec')).toContain('Albanica'); // -ec > -ica
    expect(femaleEquivalentsOf('gradžanin')).toContain('gradžanka'); // -anin > -anka
    expect(femaleEquivalentsOf('kosmetik')).toContain('kosmetička'); // k > č before -ka
    expect(femaleEquivalentsOf('drug')).toContain('družka'); // g > ž before -ka
  });

  it('only demotes a feminine that is actually derived from a candidate present', () => {
    expect(isFemaleEquivalent('lěkaŕka', 'lěkaŕ')).toBe(true);
    expect(isFemaleEquivalent('učiteljka', 'učitelj')).toBe(true);
    // A blanket "prefer masculine" would be badly wrong: these are NOT
    // derivations, and demoting them would give "gad" for snake, "načeľnik"
    // for head and "krasavėc" for beauty.
    expect(isFemaleEquivalent('zmija', 'gad')).toBe(false);
    expect(isFemaleEquivalent('glåva', 'načeľnik')).toBe(false);
    expect(isFemaleEquivalent('krasa', 'krasavėc')).toBe(false);

    // Ending in -ka is NOT enough, and this is the case that proves it:
    // "ruler" has both měrka (the measuring stick) and vladaŕ (the person),
    // and měrka is nobody's female equivalent. A mutation audit caught the
    // tests passing when the derivation check was replaced by endsWith('ka').
    expect(isFemaleEquivalent('měrka', 'vladaŕ')).toBe(false);
    expect(isFemaleEquivalent('měrka', 'vladėc')).toBe(false);
    expect(femaleEquivalentsOf('klasik')).not.toContain('klasika');
  });

  it('ranks the base above its female equivalent for an ungendered source word', () => {
    const top = rank(lex.lookupEnglish('cosmetician'), { upos: 'NOUN', gloss: 'cosmetician', lang: 'en' })[0];
    expect(top?.lemma).toBe('kosmetik');
  });

  it('leaves a feminine noun that is nobody\'s derivative alone', () => {
    const top = rank(lex.lookupEnglish('snake'), { upos: 'NOUN', gloss: 'snake', lang: 'en' })[0];
    expect(top?.lemma).toBe('zmija');
  });
});

/**
 * An open-class word is curated only for the sense its parse shows, so the
 * other sense must still reach dictionary ranking.
 */
describe('a sense the parse shows', () => {
  it('reads a counted floor as a storey, and leaves a plain floor alone', () => {
    expect(functionWordFor('floor', 'NOUN', 'en', false, [{ deprel: 'nummod', lemma: 'three' }])?.isv).toBe('etaž');
    expect(functionWordFor('floor', 'NOUN', 'en', false, [{ deprel: 'case', lemma: 'on' }])).toBeNull();
    expect(functionWordFor('floor', 'NOUN')).toBeNull();
  });

  it('reads a party one comes to or is at as an event, and leaves other parties alone', () => {
    expect(functionWordFor('party', 'NOUN', 'en', false, [{ deprel: 'case', lemma: 'to' }])?.isv).toBe('zabava');
    expect(functionWordFor('party', 'NOUN', 'en', false, [{ deprel: 'case', lemma: 'At' }])?.isv).toBe('zabava');
    expect(functionWordFor('party', 'NOUN', 'en', false, [{ deprel: 'case', lemma: 'of' }])).toBeNull();
    expect(functionWordFor('party', 'NOUN')).toBeNull();
  });

  it("reaches the sentence: van Steenbergen's storeys and party", () => {
    expect(gold('g25')).toContain('etažami');
    expect(gold('g08')).toContain('zabavy');
  });
});
