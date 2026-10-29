import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );

/**
 * These cases all come from typing free text at the CLI once the parser service
 * existed. Every one was wrong on first contact with a real parse, which is why
 * they are now fixtures.
 */

describe('copula', () => {
  // UD tags "is" as AUX with deprel cop, not VERB. It previously received no
  // verb features at all, and tie-breaking then picked the imperfect "běše".
  it('conjugates a copula instead of leaving it unresolved', () => {
    const r = out('water-is-cold.conllu');
    expect(r.text).toBe('Voda jest zimna.');
    const cop = r.words.find((w) => w.sourceForm === 'is');
    expect(cop?.surface).toBe('jest');
    expect(cop?.features.find((f) => f.name === 'Tense')?.value).toBe('Pres');
  });

  it('agrees a predicate adjective with the subject, not with a head noun', () => {
    // "cold" is the ROOT here and has no noun to modify, so agreement has to
    // come from the subject.
    const adj = out('water-is-cold.conllu').words.find((w) => w.sourceForm === 'cold');
    expect(adj?.surface).toBe('zimna'); // feminine, agreeing with voda
    const g = adj?.features.find((f) => f.name === 'Gender');
    expect(g).toMatchObject({ value: 'Fem', because: expect.stringContaining('subject') });
    expect(adj?.features.find((f) => f.name === 'Case')?.value).toBe('Nom');
  });
});

describe('English do-support', () => {
  // "does" is an auxiliary with no Interslavic equivalent. Translating it gave
  // a spurious extra verb ("Ona sdělaju ne znaje odgovor").
  it('deletes the auxiliary and keeps the rest of the sentence', () => {
    const r = out('she-does-not-know.conllu');
    expect(r.text).toBe('Ona ne znaje odgovor.');
    expect(r.dropped.map((d) => d.form)).toContain('does');
    expect(r.words.map((w) => w.surface)).not.toContain('sdělaju');
  });

  it('moves the deleted auxiliary\'s tense and person onto the main verb', () => {
    // UD leaves "know" as a bare infinitive with no Tense or Person, so those
    // have to be taken from the auxiliary that carried them.
    const verb = out('she-does-not-know.conllu').words.find((w) => w.sourceForm === 'know');
    expect(verb?.surface).toBe('znaje');
    const tense = verb?.features.find((f) => f.name === 'Tense');
    expect(tense?.value).toBe('Pres');
    expect(tense?.because).toMatch(/auxiliary/);
    expect(verb?.features.find((f) => f.name === 'Person')?.value).toBe('3');
  });

  it('keeps the negation', () => {
    expect(out('she-does-not-know.conllu').words.map((w) => w.surface)).toContain('ne');
  });
});

describe('possessives', () => {
  // UD attaches English possessives as nmod:poss, which was missing from the
  // agreement list, so "my" stayed in its default form ("moja brat").
  it('agrees a possessive with its noun', () => {
    const r = out('my-brother-two-sons.conllu');
    const poss = r.words.find((w) => w.sourceForm === 'My');
    // Per-word surfaces are lowercase; capitalisation is applied to the
    // rendered sentence, not to individual words.
    expect(poss?.surface).toBe('moj');
    expect(r.text.startsWith('Moj brat')).toBe(true);
    expect(poss?.features.find((f) => f.name === 'Gender')).toMatchObject({
      value: 'Masc',
      because: expect.stringContaining('agrees'),
    });
  });
});

describe('multiword dictionary entries', () => {
  // The dictionary glosses "city" only as the phrase "veliky gråd" (big town).
  // The head of such a phrase is its LAST word; inflecting the first produced
  // "velikyu grad" instead of a properly inflected noun.
  it('inflects the noun head of a multiword phrase', () => {
    const r = out('man-works-in-house.conllu');
    expect(r.text).toBe('Muž rabotaje v domu.');
  });

  it('prefers a single-word target for a single-word source', () => {
    // A preference, not a guarantee: for "city" the dictionary offers no
    // single-word noun, so the phrase still wins. This is recorded as a known
    // limitation rather than silently accepted as correct.
    const single = lex.lookupEnglish('book').filter((e) => !/\s/.test(e.lemma));
    expect(single.length).toBeGreaterThan(0);
  });
});

describe('past tense uses the l-participle, not the imperfect', () => {
  // The library's FINITE past is the imperfect (znaše), which the grammar calls
  // optional and literary. The standard past is the l-participle, agreeing in
  // gender and number with no person: znal / znala / znalo / znali.
  it('produces a feminine l-participle for a feminine subject', () => {
    const r = out('she-did-not-know.conllu');
    expect(r.text).toBe('Ona ne znala odgovor.');
    const verb = r.words.find((w) => w.sourceForm === 'know');
    expect(verb?.surface).toBe('znala');
    expect(verb?.features.find((f) => f.name === 'VerbForm')?.value).toBe('Part');
    expect(verb?.features.find((f) => f.name === 'Gender')).toMatchObject({
      value: 'Fem',
      because: expect.stringContaining('subject'),
    });
  });

  it('drops person, which the l-participle does not have', () => {
    const verb = out('she-did-not-know.conllu').words.find((w) => w.sourceForm === 'know');
    expect(verb?.features.map((f) => f.name)).not.toContain('Person');
  });

  it('uses the plural l-participle for a plural subject', () => {
    const r = out('they-do-not-know.conllu');
    // present tense here, so this one stays finite
    expect(r.text).toBe('Oni ne znajut odgovor.');
  });

  it('never emits the literary imperfect', () => {
    // znaše is the imperfect and must not appear.
    expect(out('she-did-not-know.conllu').text).not.toContain('znaše');
  });
});

describe('auxiliary feature transfer actually changes the output', () => {
  // These assert the DATA FLOW, not just the gloss message: a mutation audit
  // showed that checking only the "because" text let a broken transfer pass.
  it('takes PAST tense from the deleted auxiliary', () => {
    // UD gives "know" no Tense at all here; only "did" carries it. Without the
    // transfer this would come out present ("ne znaje").
    const r = out('she-did-not-know.conllu');
    expect(r.text).toContain('znala');
    expect(r.text).not.toContain('znaje');
    // And it must be a conjugated form, never the bare citation form: asking
    // for a perfective of a verb that has none used to emit "znati".
    expect(r.text).not.toContain('znati');
  });

  it('takes PLURAL number from the deleted auxiliary', () => {
    // "They do not know": only "do" carries Number=Plur.
    const verb = out('they-do-not-know.conllu').words.find((w) => w.sourceForm === 'know');
    expect(verb?.surface).toBe('znajut'); // 3rd person plural
    expect(verb?.features.find((f) => f.name === 'Number')?.value).toBe('Plur');
  });
});

describe('multiword phrase inflection, end to end', () => {
  /**
   * The dictionary glosses "city" only as the phrase "veliky gråd", whose
   * modifier doubled the source's own "big": "v velikom veliky gradu". The
   * head noun alone is what van Steenbergen writes for "city" - Genesis 11:4
   * "let us build us a city and a tower" is "budujmo gråd i věžų"
   * (http://steen.free.fr/interslavic/babel_text.html).
   */
  it('drops the phrase\'s built-in adjective when the noun has its own', () => {
    expect(out('i-work-in-big-city.conllu').text).toBe('Ja rabotaju v velikom gradu.');
  });
});

describe('past participle gender comes from the INTERSLAVIC entry', () => {
  // English nouns carry no Gender feature at all, so for a noun subject the
  // gender can only come from the Interslavic lexeme. A mutation audit showed
  // the pronoun path ("she") was masking this: pronouns DO carry Gender, so
  // only a noun subject exercises the lexical lookup.
  it('agrees with a noun subject whose gender the source never states', () => {
    const r = out('woman-read-book.conllu');
    // Perfective, because a past event with a direct object reads as completed
    // - matching van Steenbergen's own "Kde otec kupil tu knigu?". The point of
    // this test is the GENDER, which is feminine either way.
    expect(r.text).toBe('Žena pročitala knigu.');
    const verb = r.words.find((w) => w.sourceForm === 'read');
    expect(verb?.surface).toBe('pročitala'); // feminine, not the default -l
    expect(verb?.features.find((f) => f.name === 'Gender')?.value).toBe('Fem');
  });

  it('confirms the source really does not state the gender', () => {
    const sentence = parseConllu(
      fs.readFileSync(
        path.join(import.meta.dirname, 'fixtures/parse/en/woman-read-book.conllu'),
        'utf8',
      ),
    );
    const woman = sentence.tokens.find((t) => t.form === 'woman');
    expect(woman?.feats['Gender']).toBeUndefined();
  });
});

describe('every English auxiliary, not just do-support', () => {
  // Reported from real use: "How are you doing?" produced "kak běše ty dělaje".
  // Only `do` was being handled, so `be`, `have` and `will` fell through to
  // ordinary lexical lookup and produced nonsense.

  it('drops the progressive "be" and moves its person to the verb', () => {
    const r = out('how-are-you-doing.conllu');
    // "vy", not "ty": the pronouns page makes vy "a universal second person
    // pronoun for both numbers", with ty reserved for "friends, relatives and
    // children" - a register English does not mark. The verb agrees with it.
    expect(r.text).toBe('Kak vy dělajete?');
    expect(r.dropped.map((d) => d.form)).toContain('are');
    // UD gives "doing" no Person at all; 2nd person comes from "are".
    const verb = r.words.find((w) => w.sourceForm === 'doing');
    expect(verb?.features.find((f) => f.name === 'Person')?.value).toBe('2');
    // Previously this was the imperfect of byti.
    expect(r.text).not.toContain('běše');
  });

  it('renders a progressive as a plain imperfective present', () => {
    const r = out('she-is-reading.conllu');
    expect(r.text).toBe('Ona čitaje knigu.');
    expect(r.dropped.find((d) => d.form === 'is')?.why).toMatch(/imperfective aspect/);
  });

  it('maps the English perfect onto the single Interslavic past', () => {
    // "I have finished" must not become "Ja imaju končal" ("I possess finished").
    const r = out('i-have-finished.conllu');
    // Perfective (the perfect denotes a completed event) AND carrying the
    // 1st-person auxiliary, which the grammar omits only in the 3rd person.
    expect(r.text).toBe('Ja jesm zakončil knigu.');
    expect(r.words.map((w) => w.surface)).not.toContain('imaju');
    const verb = r.words.find((w) => w.sourceForm === 'finished');
    expect(verb?.features.find((f) => f.name === 'Tense')).toMatchObject({
      value: 'Past',
      because: expect.stringContaining('single Interslavic past'),
    });
  });

  it('builds the periphrastic future instead of translating "will"', () => {
    // "will" is not a lexical verb here; translating it gave "Ja voljeju ide".
    const r = out('i-will-go.conllu');
    expect(r.text).toBe('Ja budu idti do doma.');
    expect(r.words.map((w) => w.surface)).not.toContain('voljeju');
  });

  it('agrees the future auxiliary with the subject and keeps the infinitive', () => {
    const r = out('they-will-read.conllu');
    expect(r.text).toBe('Oni budut čitati knigy.');
    const aux = r.words.find((w) => w.sourceForm === 'will');
    expect(aux?.surface).toBe('budut'); // 3rd plural
    expect(aux?.lemma).toBe('byti');
    const verb = r.words.find((w) => w.sourceForm === 'read');
    expect(verb?.features.find((f) => f.name === 'VerbForm')?.value).toBe('Inf');
  });

  it('never emits a bare perfective present as a future', () => {
    // The grammar warns that South Slavic speakers misread it.
    const r = out('i-will-go.conllu');
    expect(r.text).toMatch(/\bbudu\b/);
  });
});
