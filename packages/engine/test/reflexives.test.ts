import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { hasCliticForm, isReflexivePronoun } from '../../rules/src/reflexives.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const word = (name: string, sourceForm: string) =>
  out(name).words.find((w) => w.sourceForm === sourceForm);

/**
 * Both rules are stated outright on the pronouns page and neither was built:
 *
 *   "Se is used in reflexive verbs: Ja myju se"
 *   "Whenever the possessor is also the subject of the sentence, the reflexive
 *    svoj is used, no matter whether this subject is in the third person or not"
 *
 * Before this, "He hurt himself" used the STRESSED sebe where the clitic
 * belongs, and "I wash myself" emitted raw English, because "myself" is the one
 * reflexive missing from the dictionary's gloss list for `sebe`.
 */
describe('reflexive object', () => {
  it('uses the clitic se, not the stressed sebe', () => {
    /**
     * `poranil`, not `zabolěl`: "He hurt himself" has a direct object, and the
     * dictionary marks `poraniti` "hurt, wound, injure" v.tr. while `zabolěti`
     * "hurt, ache, be painful" is v.intr. - the latter is "it hurts", not
     * "he hurt something". Transitivity is now a ranking signal, which is what
     * separates them.
     */
    expect(out('he-hurt-himself.conllu').text).toBe('On poranil se.');
    expect(out('they-defend-themselves.conllu').text).toBe('Oni obranjajut se.');
  });

  it('translates "myself", which the dictionary gloss list omits', () => {
    const text = out('i-wash-myself.conllu').text;
    expect(text).toContain(' se');
    // The bug this replaced: the English word straight through to the output.
    expect(text).not.toContain('myself');
  });

  it('marks the clitic as a decision rather than letting it fall out of a tie', () => {
    const variant = word('he-hurt-himself.conllu', 'himself')?.features.find(
      (f) => f.name === 'Variant',
    );
    expect(variant).toMatchObject({ value: 'Short', confidence: 'certain' });
    expect(variant?.because).toContain('clitic');
  });

  it('knows which cases have a clitic at all', () => {
    // Only the accusative and dative do; asking elsewhere would match nothing
    // and silently fall back to the citation form.
    expect(hasCliticForm('Acc')).toBe(true);
    expect(hasCliticForm('Dat')).toBe(true);
    expect(hasCliticForm('Gen')).toBe(false);
    expect(hasCliticForm('Ins')).toBe(false);
  });

  it('recognises every English reflexive pronoun', () => {
    for (const w of ['myself', 'yourself', 'himself', 'herself', 'itself', 'themselves']) {
      expect(isReflexivePronoun(w), w).toBe(true);
    }
    expect(isReflexivePronoun('him')).toBe(false);
  });
});

describe('reflexive possessive svoj', () => {
  it('uses svoj when the possessor is the subject', () => {
    expect(out('i-wash-my-car.conllu').text).toContain('svoj');
  });

  it('uses svoj in the third person too, and says what the alternative would be', () => {
    // The grammar's own example: "Pjotr dal Ivanu svoju knigu" = Pjotr's book.
    expect(out('he-gave-her-his-book.conllu').text).toContain('svoju');
    const note = word('he-gave-her-his-book.conllu', 'his')?.notes.join(' ') ?? '';
    // English does not distinguish the two readings, so the gloss must not
    // pretend it chose without a reason.
    expect(note).toContain('svoj');
    expect(note).toContain('jegov');
  });

  it('does not use svoj when the possessor is not the subject', () => {
    // "My brother has two sons": the possessor is 1sg, the subject 3sg, so the
    // plain possessive is required.
    //
    // Compared in LOWER CASE deliberately. A mutation audit caught this
    // assertion being vacuous: the possessive is sentence-initial, so the wrong
    // output is "Svoj brat...", which a case-sensitive check for "svoj" misses
    // entirely and the test passed while the rule was disabled.
    const text = out('my-brother-two-sons.conllu').text.toLowerCase();
    expect(text).toContain('moj brat');
    expect(text).not.toContain('svoj');
  });
});

/**
 * "If it needs to be stressed, the longer form is used: Ja myju jedino sebe
 * „I wash nobody but myself"" and "After a preposition, it is better to use
 * the longer forms" (pronouns page). The dictionary publishes "(sę, ...)" for
 * sebe, so without asking for the long form the clitic won both.
 */
describe('the long reflexive', () => {
  const gold30 = () =>
    translate(
      parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold/g30.conllu'), 'utf8')),
      lex,
      { orthography: 'standard' },
    ).text;

  it('is used when the reflexive is stressed', () => {
    expect(gold30()).toBe('Ja myju jedino sebe');
  });

  it('is used after a preposition that takes the accusative', () => {
    const into = parseConllu(
      [
        '# text = He looked into himself.',
        '# lang = en',
        '1\tHe\the\tPRON\tPRP\tCase=Nom|Gender=Masc|Number=Sing|Person=3|PronType=Prs\t2\tnsubj\t_\t_',
        '2\tlooked\tlook\tVERB\tVBD\tMood=Ind|Number=Sing|Person=3|Tense=Past|VerbForm=Fin\t0\troot\t_\t_',
        '3\tinto\tinto\tADP\tIN\t_\t4\tcase\t_\t_',
        '4\thimself\thimself\tPRON\tPRP\tCase=Acc|Gender=Masc|Number=Sing|Person=3|PronType=Prs|Reflex=Yes\t2\tobl\t_\t_',
        '5\t.\t.\tPUNCT\t.\t_\t2\tpunct\t_\t_',
        '',
      ].join('\n'),
    );
    const result = translate(into, lex, { orthography: 'standard' });
    expect(result.text).toMatch(/ v sebe\.$/);
    // Inflected, not the citation form "sebe" falling out of a failed lookup,
    // which happens to read the same.
    const himself = result.words.find((w) => w.sourceForm === 'himself')!;
    expect(himself.notes.join(' ')).not.toMatch(/could not inflect/);
  });
});
