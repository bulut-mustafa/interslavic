import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { conditionalAuxiliary, auxiliaryRole } from '../../rules/src/auxiliaries.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const en = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));
const gold = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold', name), 'utf8'));
const out = (name: string) => translate(en(name), lex, { orthography: 'standard' }).text;
const outGold = (name: string) => translate(gold(name), lex, { orthography: 'standard' }).text;

/**
 * "The conditional is formed by using the L-participle with the conditional of
 * byti 'to be': ja byh dělal(a) 'I would do'."
 * http://steen.free.fr/interslavic/verbs.html
 *
 * The library computes a conditional internally but emits no token for it, so
 * "would" fell through to ordinary lexical lookup.
 */
describe('the conditional', () => {
  it('agrees the particle with the subject', () => {
    expect(out('i-would-read.conllu')).toBe('Ja byh čital knigu.');
    expect(out('we-would-read.conllu')).toBe('My byhmo čitali.');
    expect(out('you-would-know.conllu')).toBe('Vy byste znali.');
  });

  it('uses the l-participle, which agrees in gender', () => {
    expect(out('she-would-read.conllu')).toBe('Ona by čitala knigu.');
  });

  it('does not add the compound past auxiliary on top of it', () => {
    // "ja byh čital", never "ja jesm byh čital".
    expect(out('i-would-read.conllu')).not.toContain('jesm');
  });

  it('matches the table on the verbs page', () => {
    expect(conditionalAuxiliary('1', 'Sing')).toBe('byh');
    expect(conditionalAuxiliary('2', 'Sing')).toBe('bys');
    expect(conditionalAuxiliary('3', 'Sing')).toBe('by');
    expect(conditionalAuxiliary('1', 'Plur')).toBe('byhmo');
    expect(conditionalAuxiliary('2', 'Plur')).toBe('byste');
    expect(conditionalAuxiliary('3', 'Plur')).toBe('by');
    expect(auxiliaryRole('would')).toBe('conditional');
  });
});

/**
 * "Final clauses are translated by means of že or da followed by the
 * conditional: Turisti posětet Niderlandiju, že by fotografovali tulipany."
 * http://steen.free.fr/interslavic/syntax.html
 */
describe('final clauses', () => {
  it('builds "da by" for a clause with its own subject', () => {
    // Reproduces the page's own sentence exactly.
    expect(outGold('g16.conllu')).toBe('Ona prinosi jabloka, da by děti byli zdrave.');
  });

  it('builds "že by" for a bare infinitive of purpose', () => {
    expect(outGold('g15.conllu')).toContain(', že by');
  });

  it('agrees the participle with the subject of the clause it modifies', () => {
    // The purpose clause has no subject of its own.
    expect(out('works-to-help.conllu')).toContain('že by pomagala');
  });

  it('sets the clause off with a comma, as every example on the page does', () => {
    expect(outGold('g15.conllu')).toContain(',');
    expect(outGold('g16.conllu')).toContain('jabloka,');
  });
});

/**
 * English "be going to" is a future and was translated literally: "I am going
 * to read" came out as "Ja idu čitati" - "I am walking to read".
 */
describe('the "going to" future', () => {
  it('builds the periphrastic future', () => {
    expect(out('going-to-read.conllu')).toBe('Ja budu čitati.');
  });

  it('leaves a literal "going to" a place alone', () => {
    // No infinitive xcomp, so the two patterns do not collide.
    expect(out('going-to-london.conllu')).toContain('idu');
    expect(out('going-to-london.conllu')).not.toContain('budu');
  });

  it('agrees the future auxiliary with the subject', () => {
    // "you" is unmarked for number in English, but `vy` is plural.
    expect(out('you-will-read.conllu')).toBe('Vy budete čitati.');
  });
});
