import { describe, expect, it } from 'vitest';
import { realize, selectForm } from '../src/realize.ts';

/**
 * These tests exist because a mutation audit found that the variant-preference
 * list was WRONG: it preferred Short over the unmarked form, so `byti` in the
 * 3rd person singular came out as "je" when the dictionary's own principal
 * parts say "jest".
 *
 * Expected values here are taken from the dictionary's `addition` column, which
 * states the irregular forms explicitly - an authority independent of the
 * morphology library that generates them.
 */
describe('variant selection, cross-checked against dictionary principal parts', () => {
  const pres3sg = { Tense: 'Pres', Person: '3', Number: 'Sing' };
  const form = (lemma: string, xpos: string) => {
    const r = realize({ lemma, xpos, feats: pres3sg });
    return r.ok ? r.form : `FAILED: ${r.reason}`;
  };

  it('prefers the unmarked form over Short: byti -> jest, not je', () => {
    // Dictionary: byti (jesm, jesi, jest, jesmo, jeste, sųt; byl; bųdų)
    expect(form('byti', 'v.intr. ipf.')).toBe('jest');
  });

  it('prefers Long over Short: davati -> davaje, not dava', () => {
    expect(form('davati', 'v.tr. ipf.')).toBe('davaje');
  });

  it('agrees with the dictionary on the athematic verbs', () => {
    expect(form('dati', 'v.tr. pf.')).toBe('da'); // addition: (da)
    expect(form('jesti', 'v.tr. ipf.')).toBe('je'); // addition: (je)
    expect(form('věděti', 'v.tr. ipf.')).toBe('vě'); // addition: (vě)
  });

  it('reports no ambiguity once a variant has been chosen', () => {
    // If variant preference stopped narrowing, the losing form would show up
    // here instead of being resolved.
    const r = realize({ lemma: 'davati', xpos: 'v.tr. ipf.', feats: pres3sg });
    expect(r.ok && r.ambiguous).toEqual([]);
    const b = realize({ lemma: 'byti', xpos: 'v.intr. ipf.', feats: pres3sg });
    expect(b.ok && b.ambiguous).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const once = form('byti', 'v.intr. ipf.');
    for (let i = 0; i < 5; i++) expect(form('byti', 'v.intr. ipf.')).toBe(once);
  });
});

/**
 * selectForm is tested with synthetic tokens because the real lexicon never
 * reaches the final tie-break: variant preference already resolves all 66,697
 * feature slots to one form. Testing it directly keeps the guard honest instead
 * of leaving it as unverified dead code.
 */
describe('selectForm tie-breaking (synthetic input)', () => {
  const tok = (form: string, feats: Record<string, string>) => ({
    form,
    lemma: 'x',
    upos: 'NOUN',
    xpos: 'f.',
    feats,
  });

  it('returns null when nothing matches', () => {
    expect(selectForm([tok('a', { Case: 'Nom' })], { Case: 'Gen' })).toBeNull();
  });

  it('requires ALL requested features to match, not any', () => {
    const toks = [tok('wrong', { Case: 'Nom', Number: 'Plur' }), tok('right', { Case: 'Nom', Number: 'Sing' })];
    expect(selectForm(toks, { Case: 'Nom', Number: 'Sing' })?.chosen.form).toBe('right');
  });

  it('prefers the unmarked form over Short', () => {
    const toks = [tok('je', { Case: 'Nom', Variant: 'Short' }), tok('jest', { Case: 'Nom' })];
    expect(selectForm(toks, { Case: 'Nom' })?.chosen.form).toBe('jest');
  });

  it('prefers Long over Short when no unmarked form exists', () => {
    const toks = [tok('dava', { Case: 'Nom', Variant: 'Short' }), tok('davaje', { Case: 'Nom', Variant: 'Long' })];
    expect(selectForm(toks, { Case: 'Nom' })?.chosen.form).toBe('davaje');
  });

  it('breaks a genuine tie by longer form, then alphabetically', () => {
    // Same features, same variant - only the tie-break can decide.
    const long = selectForm([tok('bb', { Case: 'Nom' }), tok('aaa', { Case: 'Nom' })], { Case: 'Nom' });
    expect(long?.chosen.form).toBe('aaa'); // longer wins
    const alpha = selectForm([tok('zz', { Case: 'Nom' }), tok('aa', { Case: 'Nom' })], { Case: 'Nom' });
    expect(alpha?.chosen.form).toBe('aa'); // same length -> alphabetical
  });

  it('is order-independent for tied input', () => {
    const a = [tok('bb', { Case: 'Nom' }), tok('aaa', { Case: 'Nom' })];
    expect(selectForm(a, { Case: 'Nom' })?.chosen.form).toBe(
      selectForm([...a].reverse(), { Case: 'Nom' })?.chosen.form,
    );
  });

  it('reports the losing forms as alternatives', () => {
    const r = selectForm([tok('aaa', { Case: 'Nom' }), tok('bbb', { Case: 'Nom' })], { Case: 'Nom' });
    expect(r?.alternatives).toEqual(['bbb']);
  });
});

/**
 * Word-specific forms are the dictionary's to state. It gives "mati (matere)"
 * and "dȯći (dȯćere)", and the variant preference below was overruling both:
 * the athematic `matere` carries `Variant=Athematic` and the regular `materi`
 * carries none, so the unmarked form won the genitive singular.
 *
 * The nouns page sanctions both - "mati is inflected like kost: gen./dat.
 * materi" is offered as a way to avoid the athematic declension, whose own
 * table gives `matere` - so this is not a correctness fix but a question of
 * who decides, and for one word that is the dictionary.
 * http://steen.free.fr/interslavic/nouns.html
 */
describe('a form the dictionary publishes', () => {
  const pp = [['matere']];

  it('outranks the variant preference', () => {
    const r = realize({ lemma: 'mati', xpos: 'f.', feats: { Case: 'Gen', Number: 'Sing' }, principalParts: pp });
    expect(r.ok && r.form).toBe('matere');
  });

  it('does not change a word the dictionary says nothing extra about', () => {
    const r = realize({ lemma: 'mati', xpos: 'f.', feats: { Case: 'Gen', Number: 'Sing' } });
    expect(r.ok && r.form).toBe('materi');
  });

  it('is ignored when the named form does not fit the requested features', () => {
    // `matere` is a genitive, so it must not be dragged into the dative.
    const r = realize({ lemma: 'mati', xpos: 'f.', feats: { Case: 'Dat', Number: 'Sing' }, principalParts: pp });
    expect(r.ok && r.form).toBe('materi');
  });
});
