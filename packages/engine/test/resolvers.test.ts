import { describe, expect, it } from 'vitest';
import type { Case, ParsedSentence, UdToken } from '../../types/index.ts';
import { resolveCase } from '../src/resolvers/case.ts';
import { resolveAspect } from '../src/resolvers/aspect.ts';

/** Minimal graph builder, so resolvers are tested without a parser or lexicon. */
function graph(tokens: Partial<UdToken>[], lang: 'en' | 'ru' = 'en'): ParsedSentence {
  return {
    text: '',
    lang,
    tokens: tokens.map((t, i) => ({
      id: t.id ?? i + 1,
      form: t.form ?? 'x',
      lemma: t.lemma ?? t.form ?? 'x',
      upos: t.upos ?? 'NOUN',
      feats: t.feats ?? {},
      head: t.head ?? 0,
      deprel: t.deprel ?? 'root',
    })),
  };
}

describe('case cascade', () => {
  const run = (
    deprel: string,
    extra: { prepositionGoverns?: Case; verbGoverns?: Case } = {},
  ) => {
    const s = graph([
      { id: 1, form: 'verb', upos: 'VERB', deprel: 'root', head: 0 },
      { id: 2, form: 'n', upos: 'NOUN', deprel, head: 1 },
    ]);
    return resolveCase({ token: s.tokens[1]!, sentence: s, ...extra });
  };

  it('nsubj -> nominative, certain', () => {
    expect(run('nsubj')).toMatchObject({ value: 'Nom', confidence: 'certain' });
  });

  it('iobj -> dative, certain', () => {
    expect(run('iobj')).toMatchObject({ value: 'Dat', confidence: 'certain' });
  });

  it('obj -> accusative, but only as a default', () => {
    expect(run('obj')).toMatchObject({ value: 'Acc', confidence: 'default' });
  });

  it('preposition government outranks the deprel default', () => {
    expect(run('obj', { prepositionGoverns: 'Loc' })).toMatchObject({
      value: 'Loc',
      ruleId: 'case.prep.governed',
      confidence: 'certain',
    });
  });

  it('verb government outranks the deprel default', () => {
    expect(run('obj', { verbGoverns: 'Gen' })).toMatchObject({
      value: 'Gen',
      ruleId: 'case.verb.governed',
    });
  });

  it('falls back to nominative, flagged as a guess', () => {
    expect(run('dislocated')).toMatchObject({ confidence: 'guess', value: 'Nom' });
  });
});

describe('aspect chain', () => {
  it('copies aspect from a Russian source', () => {
    const s = graph([{ id: 1, upos: 'VERB', feats: { Aspect: 'Perf' }, deprel: 'root' }], 'ru');
    const out = resolveAspect({ token: s.tokens[0]!, sentence: s });
    expect(out.decision).toMatchObject({ value: 'Perf', confidence: 'certain' });
    expect(out.declined).toEqual([]);
  });

  it('forces imperfective in the present tense', () => {
    const s = graph([{ id: 1, upos: 'VERB', feats: { Tense: 'Pres' }, deprel: 'root' }]);
    const out = resolveAspect({ token: s.tokens[0]!, sentence: s });
    expect(out.decision.value).toBe('Imp');
    expect(out.decision.because).toMatch(/future/);
  });

  it('reads a habitual adverb as imperfective VIA THE CUE RULE', () => {
    // Asserting the value alone is not enough: the default is also Imp, so an
    // emptied cue list would produce the same answer for the wrong reason.
    // The ruleId is what proves the cue actually fired.
    const s = graph([
      { id: 1, upos: 'VERB', feats: { Tense: 'Past' }, deprel: 'root', head: 0 },
      { id: 2, form: 'always', lemma: 'always', upos: 'ADV', deprel: 'advmod', head: 1 },
    ]);
    const out = resolveAspect({ token: s.tokens[0]!, sentence: s });
    expect(out.decision.value).toBe('Imp');
    expect(out.decision.ruleId).toBe('aspect.adverbial.imp');
    expect(out.decision.confidence).toBe('high');
    // aspect.perfect also declines here: there is no perfect auxiliary.
    expect(out.declined).toEqual(['aspect.copy', 'aspect.perfect']);
  });

  it('reads a completive adverb as perfective', () => {
    const s = graph([
      { id: 1, upos: 'VERB', feats: { Tense: 'Past' }, deprel: 'root', head: 0 },
      { id: 2, form: 'suddenly', lemma: 'suddenly', upos: 'ADV', deprel: 'advmod', head: 1 },
    ]);
    expect(resolveAspect({ token: s.tokens[0]!, sentence: s }).decision.value).toBe('Perf');
  });

  it('defaults to imperfective and admits it is a guess', () => {
    const s = graph([{ id: 1, upos: 'VERB', feats: { Tense: 'Past' }, deprel: 'root' }]);
    const out = resolveAspect({ token: s.tokens[0]!, sentence: s });
    expect(out.decision).toMatchObject({ value: 'Imp', confidence: 'guess' });
    expect(out.declined).toContain('aspect.tense');
  });
});
