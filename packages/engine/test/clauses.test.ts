import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { candidatesForEnglish } from '../../rules/src/prepositions.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * "The imperative has forms for the 2nd person singular, the 1st person plural
 * and the 2nd person plural: dělaj 'do!' (to one person, informal), dělajmo
 * 'let's do!', dělajte 'do!' (to more persons, or to one person formal)."
 * http://steen.free.fr/interslavic/verbs.html
 *
 * The 2nd plural is the default for the same reason `vy` is: English marks
 * neither number nor register, and the page gives that form for "one person
 * formal" too. Before this, "Open the window" was realised as the
 * third-person present "otvarjaje".
 */
describe('the imperative', () => {
  it('uses an imperative form, not the present tense', () => {
    expect(out('open-the-window.conllu')).toContain('Otvarjajte');
    expect(out('read-the-book.conllu')).toBe('Čitajte knigu.');
  });

  it('keeps verb government in the imperative', () => {
    // pomagati takes the dative.
    expect(out('help-me.conllu')).toBe('Pomagajte mně!');
  });

  it('uses the first-person plural for "let us"', () => {
    // Interslavic HAS this form; the optative is for the third person, which it
    // does not. "Let us go" was becoming "Nehaj ide".
    expect(out('let-us-go.conllu')).toBe('Idimo.');
  });

  it('still uses the optative for a third-person "let"', () => {
    expect(out('let-him-go.conllu')).toBe('Nehaj ide.');
  });
});

/**
 * The conjunctions list gives `že` for "that" directly, and the pronouns page
 * says "The relative pronoun that is used most frequently is ktory. It is
 * inflected like an ordinary adjective." Both were being translated by gloss,
 * which reached the demonstrative and the interrogative instead.
 */
describe('subordinate clauses', () => {
  it('uses "že" for a complementizer, not a demonstrative', () => {
    // Was "kazala mně tamtogo ona byla...".
    expect(out('told-me-that.conllu')).toBe('Ona kazala mně že ona byla utomljena.');
  });

  it('uses "ktory" for a relative pronoun, not the interrogative "kto"', () => {
    // Was "Muž kto žive tam".
    expect(out('man-who-lives.conllu')).toBe('Muž ktory žive tam jest moj stryjec.');
  });

  it('agrees the relative pronoun with its antecedent', () => {
    // "kniga" is feminine and the pronoun is the object, so accusative feminine.
    expect(out('book-which-i-read.conllu')).toContain('ktoru');
  });

  it('takes animacy from the antecedent', () => {
    // "dom" is masculine INANIMATE, so the accusative equals the nominative.
    // Without animacy the adjective paradigm gave the animate "ktorogo".
    expect(out('house-that-i-built.conllu')).toContain('dom ktory');
  });

  it('takes the ANIMATE accusative when the antecedent is animate', () => {
    expect(out('man-that-i-saw.conllu')).toContain('Muž ktorogo');
  });

  it('defaults to inanimate when the antecedent is not in the dictionary', () => {
    // An untranslated antecedent has no gender either, so this cannot be
    // conditioned on gender - doing so left the animate "ktorogo".
    expect(out('unknown-antecedent.conllu')).toContain('Blargistan ktory');
  });

  it('agrees a copula with a subject that hangs off the predicate', () => {
    // "you are right": `you` hangs off `right`, not off the copula, so reading
    // only the copula's dependents gave the 2nd SINGULAR "jesi".
    //
    // `pravi`, not `prave`: the addressee is a person, so the predicate is
    // masculine ANIMATE, which is the one distinction the nominative plural
    // still draws - "Vse kury sųt jednakove i vsi ljudi sųt jednakovi".
    expect(out('you-are-right.conllu')).toBe('Vy jeste pravi.');
  });
});

/**
 * The dictionary marks the directional sense of a preposition in the gloss
 * itself - "under (direction)", "before (direction)" - and the index used to
 * strip that parenthetical, so the directional accusative competed with the
 * stable sense on frequency alone and won.
 */
describe('motion is taken from the dictionary, not guessed', () => {
  it('keeps the directional sense out of the lead by default', () => {
    const under = candidatesForEnglish('under');
    expect(under[0]).toMatchObject({ case: 'Ins', direction: false });
    expect(under.some((c) => c.direction && c.case === 'Acc')).toBe(true);
  });

  it('does not treat a temporal "before" as a destination', () => {
    // Was "prěd polnoč" - accusative, as if midnight were somewhere to go.
    expect(out('leave-before-midnight.conllu')).toContain('prěd polnočju');
  });

  it('still uses the accusative for real motion', () => {
    expect(out('cat-ran-under-table.conllu')).toContain('pod stol');
    expect(out('cat-sits-under-table.conllu')).toContain('pod stolom');
  });
});

describe('the compound past auxiliary', () => {
  it('appears in the first person and not in the third', () => {
    // The page omits it "only in the third person".
    expect(out('i-could-swim.conllu')).toBe('Ja jesm mogl plavati.');
    expect(out('he-could-swim.conllu')).toBe('On mogl plavati.');
  });
});

/**
 * "Just like in the case of nouns, the accusative of has the same form as the
 * genitive when the corresponding noun is masculine and animate, both singular
 * and plural." http://steen.free.fr/interslavic/adjectives.html
 *
 * The genitive-like accusative is therefore LICENSED by an animate noun. Where
 * no such noun exists the plain form is required, which is what
 * `animacy.noAnimateHead` supplies - the relative pronoun's own default used to
 * be the only place this was handled.
 */
describe('an accusative with no animate noun to agree with', () => {
  it('uses the plain form for a language name', () => {
    // "Interslavic" is tagged PROPN but its dictionary entry is the ADJECTIVE
    // `medžuslovjansky`, so it never received lexical animacy and the paradigm
    // tie-break produced the animate "medžuslovjanskogo".
    expect(out('do-you-speak-interslavic.conllu')).toBe('Vy rěčete medžuslovjansky?');
  });

  it('does not disturb a noun whose animacy the dictionary states', () => {
    expect(out('i-see-the-man.conllu')).toBe('Ja vidžu muža.');
    expect(out('i-see-the-house.conllu')).toBe('Ja vidžu dom.');
  });
});
