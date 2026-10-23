import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { codeBelongsToPreposition, prepositionLemmas } from '../../rules/src/prepositions.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const en = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));
const out = (name: string) => translate(en(name), lex, { orthography: 'standard' });
const word = (name: string, sourceForm: string) =>
  out(name).words.find((w) => w.sourceForm === sourceForm);
const caseOf = (name: string, sourceForm: string) =>
  word(name, sourceForm)?.features.find((f) => f.name === 'Case');

/**
 * 45 dictionary entries state the case their complement takes, using the same
 * numeric codes as the prepositions. `resolveCase` accepted a verbGoverns
 * argument from the start, but nothing ever supplied it, so every direct object
 * fell through to the `default`-confidence accusative - which is wrong for
 * exactly the verbs a learner is most likely to get wrong by analogy with
 * English.
 */
describe('verb government', () => {
  it('puts the object of pomagati in the dative, not the accusative', () => {
    // "svojemu", not "mojemu": the possessor is the subject, which the pronouns
    // page requires the reflexive possessive for. The point here is the DATIVE.
    expect(out('help-brother.conllu').text).toBe('Ja pomagaju svojemu bratu.');
  });

  it('puts the object of izběgati in the genitive', () => {
    expect(out('avoid-question.conllu').text).toBe('Ja izběgaju pytanja.');
  });

  it('cites the dictionary code rather than asserting the rule', () => {
    expect(caseOf('help-brother.conllu', 'brother')).toMatchObject({
      value: 'Dat',
      confidence: 'high',
    });
    expect(caseOf('help-brother.conllu', 'brother')?.because).toContain('(+3)');
    expect(caseOf('help-brother.conllu', 'brother')?.because).toContain('pomagati');
  });

  it('propagates the governed case through agreement to the modifier', () => {
    // "my brother" is nmod:poss, so the possessive has to follow the object
    // into the dative; a governed case that agreement ignored would read as
    // "mojego bratu".
    expect(caseOf('help-brother.conllu', 'my')).toMatchObject({ value: 'Dat' });
  });

  it('leaves an ungoverned verb on the accusative default, with its doubt visible', () => {
    // Control: a verb carrying no code must keep the honest `default` accusative
    // rather than acquire a case from somewhere.
    expect(caseOf('woman-read-book.conllu', 'book')).toMatchObject({
      value: 'Acc',
      confidence: 'default',
    });
    expect(out('woman-read-book.conllu').text).toBe('Žena pročitala knigu.');
  });

  /**
   * Of the 78 verb entries carrying a code, 33 have a preposition inside the
   * lemma ("obhoditi sę bez (+2)"). There the code says what the PREPOSITION
   * governs, so reading it as verb government would impose a case on a bare
   * object that should never have had one.
   */
  it('knows which lemmas end in a preposition, so their code is not verb government', () => {
    const preps = prepositionLemmas();
    expect(preps.has('bez')).toBe(true);
    expect(preps.has('k')).toBe(true);
    expect(preps.has('do')).toBe(true);
    expect(preps.has('pomagati')).toBe(false);

    // The predicate the pipeline actually uses.
    expect(codeBelongsToPreposition('obhoditi sę bez')).toBe(true);
    expect(codeBelongsToPreposition('obraćati sę k')).toBe(true);
    expect(codeBelongsToPreposition('pomagati')).toBe(false);
    expect(codeBelongsToPreposition('vladati')).toBe(false);
  });
});
