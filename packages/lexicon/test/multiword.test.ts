import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { splitMultiword } from '../src/steen/split-lemmas.ts';
import { Lexicon } from '../src/reader.ts';
import { buildFullFormIndex } from '../src/full-forms.ts';
import { paradigm, realize } from '../../morph/src/realize.ts';

/**
 * Built once at module scope. Inside a test the 743k-form build exceeds the
 * 30s test timeout; at module scope it counts as collection, which is how
 * validation.test.ts does it too.
 */
const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
const index = buildFullFormIndex(
  Lexicon.fromTsv(path.join(ROOT_DIR, 'packages/lexicon/data/raw/words.tsv')),
);

/**
 * 169 dictionary entries (0.87%) were producing the morphology library's own
 * error marker in place of a form - "stråniti sę od" realised as "stråniti sę
 * ERROR2ų", and "byti dȯlžėn", "dati råbotų", "doběgati do" likewise.
 *
 * Two causes. `splitMultiword` took the LAST word as the head, which is right
 * for a noun phrase ("veliky gråd") and wrong for a verb phrase, so `na`, `do`
 * and `dȯlžėn` were handed to the conjugator. And a leading `ne` is the
 * negation particle, not the head.
 *
 * Nothing caught it: the full-form index is generated the same way, so it held
 * the ERROR strings and the validator certified them as real Interslavic.
 */
describe('a multiword verb phrase', () => {
  it('inflects the verb, which comes first', () => {
    expect(splitMultiword('bazovati na', 'VERB')).toMatchObject({ head: 'bazovati', after: 'na' });
    expect(splitMultiword('dati råbotų', 'VERB')).toMatchObject({ head: 'dati', after: 'råbotų' });
  });

  it('still inflects the last word of a NOUN phrase', () => {
    expect(splitMultiword('veliky gråd')).toMatchObject({ head: 'gråd', before: 'veliky' });
  });

  it('reports whether the tail is really a clitic', () => {
    /**
     * The verb branch is shared with the reflexive one, and it used to return a
     * hardcoded `reflexive: true` - so it claimed "bazovati na" ended in a
     * clitic. Callers choosing between a verb that can take a complement
     * directly and one carrying its own preposition read this flag.
     */
    expect(splitMultiword('bojati sę', 'VERB').reflexive).toBe(true);
    expect(splitMultiword('buditi sę', 'VERB').reflexive).toBe(true);
    expect(splitMultiword('bazovati na', 'VERB').reflexive).toBe(false);
    expect(splitMultiword('stråniti sę od', 'VERB').reflexive).toBe(false);
  });

  it('keeps a reflexive clitic riding along', () => {
    expect(splitMultiword('stråniti sę od', 'VERB')).toMatchObject({
      head: 'stråniti',
      after: 'sę od',
    });
  });

  it('treats a leading "ne" as the negation particle, not the head', () => {
    const s = splitMultiword('ne ljubiti', 'VERB');
    expect(s.head).toBe('ljubiti');
    expect(s.before).toBe('ne');
  });

  it('produces real forms for all of them', () => {
    const feats = { Person: '3', Number: 'Sing', Tense: 'Pres', VerbForm: 'Fin', Mood: 'Ind' };
    for (const [lemma, xpos] of [
      ['stråniti sę od', 'v.refl. ipf.'],
      ['byti dȯlžėn', 'v.aux. ipf.'],
      ['dati råbotų', 'v.pf.'],
      ['doběgati do', 'v.intr. ipf.'],
      ['ne ljubiti', 'v.tr. ipf.'],
    ] as const) {
      const r = realize({ lemma, xpos, feats });
      expect(r.ok, lemma).toBe(true);
      expect(r.ok && r.form, lemma).not.toMatch(/ERROR/);
    }
  });
});

/**
 * The library reports a stem it cannot handle by RETURNING a form containing
 * "ERROR", not by throwing. Two independent guards, because a single one let
 * this reach the user: realisation refuses such a form, and the index never
 * holds one.
 */
describe('the library\'s error marker', () => {
  it('is reported as a failure, not as a form', () => {
    // A row the dictionary mis-tags as a verb - "na" is a preposition.
    const r = realize({ lemma: 'na', xpos: 'v.ipf.', feats: { VerbForm: 'Inf' } });
    if (r.ok) expect(r.form).not.toMatch(/ERROR/);
    else expect(r.reason).toContain('could not build');
  });

  it('never enters the full-form index', () => {
    expect(index.has('ERROR2ti')).toBe(false);
    expect(index.has('ERROR2ų')).toBe(false);
  });

  it('is still produced by the library for mis-tagged rows, so the guard matters', () => {
    // If this ever stops being true the guards are harmless, but the comment
    // above would be stale - so the premise is asserted rather than assumed.
    const toks = paradigm('na', 'v.ipf.');
    expect(toks.some((t) => /ERROR/.test(t.form ?? ''))).toBe(true);
  });
});
