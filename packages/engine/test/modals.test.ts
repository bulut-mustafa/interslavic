import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { modalFor, UNHANDLED_MODALS } from '../../rules/src/modals.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const feat = (name: string, sourceForm: string, featureName: string) =>
  out(name).words.find((w) => w.sourceForm === sourceForm)?.features.find((f) => f.name === featureName);

/**
 * Modals were the worst output the engine produced, because a modal is tagged
 * AUX, which meant it got no verb features at all and its complement was
 * conjugated instead of left as an infinitive:
 *
 *   "I can swim."       ->  Ja možeše plavaju   (an imperfect 3sg)
 *   "I could swim."     ->  Ja could plavaju    (raw English)
 *   "He must go."       ->  On imaju ide        ("imati" = to have)
 *
 * The dictionary marks the right verbs `v.aux.`, so the data was always there.
 */
describe('modal verbs', () => {
  it('conjugates the modal and leaves the main verb an infinitive', () => {
    expect(out('i-can-swim.conllu').text).toBe('Ja mogu plavati.');
    expect(out('we-can-read.conllu').text).toBe('My možemo čitati.');
  });

  it('carries the tense on the modal, as English does', () => {
    // "jesm mogl", with the compound-past auxiliary: the verbs page omits it
    // "only in the THIRD person". This previously read "Ja mogl plavati",
    // which was a symptom of a bug - subjectPerson could not see the modal's
    // subject (it hangs off the main verb) and defaulted to 3rd person,
    // suppressing the auxiliary. "He could swim" is still "On mogl plavati".
    expect(out('i-could-swim.conllu').text).toBe('Ja jesm mogl plavati.');
    expect(feat('i-could-swim.conllu', 'could', 'Tense')).toMatchObject({ value: 'Past' });
  });

  it('takes person and number from the subject of the verb the modal governs', () => {
    // UD hangs the subject off the main verb, not off the modal, so reading
    // the modal's own features gives a 3rd-person singular for "we can".
    expect(feat('we-can-read.conllu', 'can', 'Person')).toMatchObject({ value: '1' });
    expect(feat('we-can-read.conllu', 'can', 'Number')).toMatchObject({ value: 'Plur' });
  });

  it('uses the verb the dictionary marks v.aux., not the frequent lookalike', () => {
    // "must" outranks to "iměti, imati" on frequency, which means "to have".
    expect(out('he-must-go.conllu').text).toBe('On musi idti.');
    expect(out('he-must-go.conllu').text).not.toContain('ima');
  });

  it('puts `ne` before the modal, which is the finite verb', () => {
    const text = out('father-could-not-find.conllu').text;
    expect(text).toContain('ne mogl');
    expect(text).not.toContain('mogl ne');
  });

  it('marks the complement as an infinitive with its reason', () => {
    expect(feat('i-can-swim.conllu', 'swim', 'VerbForm')).toMatchObject({
      value: 'Inf',
      confidence: 'certain',
    });
    expect(feat('i-can-swim.conllu', 'swim', 'VerbForm')?.because).toContain('modal');
  });

  it('cites the evidence for each curated modal', () => {
    for (const lemma of ['can', 'could', 'may', 'might', 'must']) {
      const plan = modalFor(lemma);
      expect(plan, lemma).not.toBeNull();
      expect(plan!.why.length, lemma).toBeGreaterThan(20);
      expect(plan!.evidence.length, lemma).toBeGreaterThan(20);
    }
  });

  it('leaves the modals whose Interslavic needs the conditional alone', () => {
    // Guessing a finite verb for "should"/"would" would produce confident
    // nonsense; they stay unhandled and visible until the conditional is built.
    for (const lemma of UNHANDLED_MODALS) {
      expect(modalFor(lemma), lemma).toBeNull();
    }
  });
});
