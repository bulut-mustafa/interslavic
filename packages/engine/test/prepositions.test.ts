import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { candidatesForEnglish } from '../../rules/src/prepositions.ts';
import { governmentFor, numeralValue } from '../../rules/src/numerals.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const en = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));
const out = (name: string) => translate(en(name), lex, { orthography: 'standard' });

describe('preposition government', () => {
  // The dictionary splits ambiguous prepositions by sense, so the English
  // gloss selects both the Interslavic preposition and the case it governs.
  it('reads the government table from the dictionary codes', () => {
    expect(candidatesForEnglish('in')[0]).toMatchObject({ prep: 'v', case: 'Loc' });
    expect(candidatesForEnglish('into')[0]).toMatchObject({ prep: 'v', case: 'Acc' });
    expect(candidatesForEnglish('on')[0]).toMatchObject({ prep: 'na', case: 'Loc' });
    expect(candidatesForEnglish('onto')[0]).toMatchObject({ prep: 'na', case: 'Acc' });
    expect(candidatesForEnglish('without')[0]).toMatchObject({ prep: 'bez', case: 'Gen' });
    expect(candidatesForEnglish('with')[0]).toMatchObject({ prep: 's', case: 'Ins' });
  });

  it('distinguishes static location from motion with the SAME preposition', () => {
    // The classic Slavic contrast: v + Loc "in" vs v + Acc "into".
    expect(out('man-works-in-house.conllu').text).toBe('Muž rabotaje v domu.');
    expect(out('man-goes-into-house.conllu').text).toBe('Muž ide v dom.');
  });

  it('records the governed case with its justification', () => {
    const w = out('man-works-in-house.conllu').words.find((x) => x.sourceForm === 'house');
    const c = w?.features.find((f) => f.name === 'Case');
    expect(c?.value).toBe('Loc');
    expect(c?.because).toMatch(/govern/);
  });

  it('is deterministic for ambiguous prepositions', () => {
    const a = candidatesForEnglish('for').map((c) => `${c.prep}+${c.case}`);
    const b = candidatesForEnglish('for').map((c) => `${c.prep}+${c.case}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1); // genuinely ambiguous, so order matters
  });
});

describe('English case-marker prepositions are deleted, not translated', () => {
  // Interslavic expresses these with a bare case, exactly as the iobj in
  // "gives the girl a book" becomes a bare dative.
  it('recipient "to" becomes a bare dative', () => {
    const r = out('man-gives-book-to-girl.conllu');
    expect(r.text).toBe('Muž davaje knigu děvě.');
    expect(r.dropped.map((d) => d.form)).toContain('to');
    const girl = r.words.find((w) => w.sourceForm === 'girl');
    expect(girl?.features.find((f) => f.name === 'Case')).toMatchObject({ value: 'Dat' });
  });

  it('agrees with the iobj spelling of the same sentence', () => {
    // "gives the girl a book" and "gives a book to the girl" are the English
    // dative alternation; both must produce the same Interslavic case.
    const iobj = out('boy-gives-girl-book.conllu').words.find((w) => w.sourceForm === 'girl');
    const obl = out('man-gives-book-to-girl.conllu').words.find((w) => w.sourceForm === 'girl');
    expect(iobj?.surface).toBe('děvě');
    expect(obl?.surface).toBe('děvě');
  });

  it('does not emit a preposition for the deleted marker', () => {
    expect(out('man-gives-book-to-girl.conllu').text).not.toMatch(/\bdo\b|\bk\b/);
  });

  it('"of" becomes a bare genitive', () => {
    const r = out('book-of-man.conllu');
    expect(r.text).toBe('Ja vidžu knigu muža.');
    expect(r.dropped.map((d) => d.form)).toContain('of');
    expect(r.words.find((w) => w.sourceForm === 'man')?.features.find((f) => f.name === 'Case'))
      .toMatchObject({ value: 'Gen' });
  });

  it('keeps DIRECTIONAL "to" as a real preposition', () => {
    // Only a recipient "to" is a case marker. "goes to the house" has no direct
    // object, so this is motion and the preposition must survive.
    const r = out('man-goes-to-house.conllu');
    expect(r.text).toBe('Muž ide do doma.');
    expect(r.dropped.map((d) => d.form)).not.toContain('to');
    expect(r.words.find((w) => w.sourceForm === 'house')?.features.find((f) => f.name === 'Case'))
      .toMatchObject({ value: 'Gen' });
  });

  it('uses the preposition the GOVERNMENT TABLE chose, not the frequency winner', () => {
    // Plain lexical ranking would pick whichever "to" entry is commonest; the
    // government table must decide, because the case depends on it.
    const r = out('man-goes-to-house.conllu');
    const prep = r.words.find((w) => w.sourceForm === 'to');
    expect(prep?.surface).toBe('do');
    expect(prep?.lexicalChoice?.because).toMatch(/ambiguous/);
  });

  it('marks an ambiguous preposition as a guess, not a certainty', () => {
    // "to" maps to do+Gen and k+Dat - different cases, so the choice is a
    // default and the gloss must say so rather than claiming certainty.
    const c = out('man-goes-to-house.conllu')
      .words.find((w) => w.sourceForm === 'house')
      ?.features.find((f) => f.name === 'Case');
    expect(c?.confidence).toBe('default');
    expect(c?.alternatives.map((a) => a.value)).toContain('Dat');
  });

  it('emits the preposition whose government it applied', () => {
    // 13 of 130 glosses diverge between the government table and plain
    // frequency ranking. "at" is one: the table says na (+Loc) while lexical
    // ranking prefers u, which governs the GENITIVE. Letting ranking win would
    // emit one preposition while applying another's case.
    const r = out('man-works-at-house.conllu');
    expect(r.words.find((w) => w.sourceForm === 'at')?.surface).toBe('na');
    expect(r.words.find((w) => w.sourceForm === 'house')?.features
      .find((f) => f.name === 'Case')?.value).toBe('Loc');
    expect(r.text).toBe('Muž rabotaje na domu.');
  });

  it('marks an unambiguous preposition as certain', () => {
    const c = out('man-works-in-house.conllu')
      .words.find((w) => w.sourceForm === 'house')
      ?.features.find((f) => f.name === 'Case');
    // every candidate for "in" governs the locative
    expect(c?.confidence).toBe('high');
  });
});

describe('indeclinables', () => {
  it('passes a preposition through without trying to inflect it', () => {
    const w = out('man-works-in-house.conllu').words.find((x) => x.sourceForm === 'in');
    expect(w?.surface).toBe('v');
    expect(w?.validation).toBe('validated');
    // Previously these were asked for a Number feature, failed to inflect, and
    // were wrongly reported as unvalidated.
    expect(w?.notes.join(' ')).not.toMatch(/could not inflect/);
  });
});

describe('numeral government', () => {
  // Quoted from interslavic.fun/learn/grammar/numbers/: "nominative singular
  // after 1, the nominative plural after 2-4 and the genitive plural after 5
  // and more: jedin dom, dva domy, četyri domy, pet domov."
  it('reads numeral values from words and digits', () => {
    expect(numeralValue('five', 'five', 'en')).toBe(5);
    expect(numeralValue('пять', 'пять', 'ru')).toBe(5);
    expect(numeralValue('x', '5', 'en')).toBe(5);
    expect(numeralValue('x', '1 000', 'en')).toBe(1000);
    expect(numeralValue('frobnitz', 'frobnitz', 'en')).toBeNull();
  });

  it('matches the grammar: 1 -> singular, 2-4 -> plural, 5+ -> genitive plural', () => {
    expect(governmentFor(1)).toMatchObject({ number: 'Sing', case: null, stated: true });
    expect(governmentFor(3)).toMatchObject({ number: 'Plur', case: null, stated: true });
    expect(governmentFor(5)).toMatchObject({ number: 'Plur', case: 'Gen', stated: true });
    expect(governmentFor(20)).toMatchObject({ number: 'Plur', case: 'Gen', stated: true });
  });

  it('flags compound numerals as not covered by the grammar', () => {
    // The grammar says "5 and more" and never addresses 22, so we must not
    // pretend to know. Standard Slavic would key off the last digit.
    expect(governmentFor(22).stated).toBe(false);
    expect(governmentFor(25).stated).toBe(true);
  });

  it('produces the grammar\'s own examples end-to-end', () => {
    expect(out('i-see-two-houses.conllu').text).toBe('Ja vidžu dva domy.');
    expect(out('i-see-five-houses.conllu').text).toBe('Ja vidžu pet domov.');
  });

  it('does NOT force the nominative on a direct object', () => {
    // "nominative singular after 1" is the citation form; "I see one house" is
    // an accusative phrase, so only the NUMBER is fixed by the numeral.
    const r = out('i-see-two-houses.conllu');
    const noun = r.words.find((w) => w.sourceForm === 'houses');
    expect(noun?.features.find((f) => f.name === 'Number')?.value).toBe('Plur');
  });

  it('makes the numeral agree with the noun\'s post-government features', () => {
    // Ordering check: government must run BEFORE agreement, or the numeral
    // agrees with stale features (this produced "jedne dom" instead of
    // "jedin dom").
    const r = out('i-see-two-houses.conllu');
    expect(r.words.find((w) => w.sourceForm === 'two')?.surface).toBe('dva');
  });
});

/**
 * Collective numerals "can be used instead of a cardinal number" with
 * pluralia tantum ("dvoje dverij") and with ljudi and děti ("četvero dětij").
 * http://steen.free.fr/interslavic/numerals.html - optional, so the cardinal
 * stays and the collective is named beside it.
 */
describe('collective numerals', () => {
  const collectiveNote = (name: string, source: string) =>
    out(name).words.find((w) => w.sourceForm === source)?.notes.find((n) => n.includes('collective'));

  it('keeps the cardinal and names the collective for a plural-only noun', () => {
    expect(out('i-see-two-doors.conllu').text).toBe('Ja vidžu dvě dveri.');
    expect(collectiveNote('i-see-two-doors.conllu', 'doors')).toContain('"dvoje"');
  });

  it('does so for children too, which reach the noun through "child"', () => {
    expect(out('four-children.conllu').text).toBe('Ja imaju četyri děti.');
    expect(collectiveNote('four-children.conllu', 'children')).toContain('"četvero"');
  });

  it('says nothing for an ordinary countable noun', () => {
    expect(collectiveNote('i-see-two-houses.conllu', 'houses')).toBeUndefined();
  });
});
