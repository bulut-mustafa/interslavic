import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { RECIPIENT_VERB_LEMMAS } from '../src/resolvers/preposition.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * "Yes/no questions can be made in three different ways: either it differs
 * from a normal declarative sentence only by intonation: - Otec kupil knigu?
 * [...] or this sentence is preceded by the particle či [...] or it is marked
 * by the question particle li placed right after the focus point of the
 * question, usually the verb: - Kupil li otec knigu?"
 * http://steen.free.fr/interslavic/syntax.html
 *
 * All three keep the subject before the verb. English inversion is not one of
 * them, and it was being copied straight through.
 */
describe('a yes/no question keeps declarative order', () => {
  it('puts the subject before the verb', () => {
    // Was "Možete vy pomagati mně?" and "Jeste vy utomljeni?".
    expect(out('can-you-help-me.conllu')).toBe('Vy možete pomogti mně?');
    expect(out('are-you-tired.conllu')).toBe('Vy jeste utomljeni?');
  });

  it('leaves a wh-question alone, where the interrogative is fronted', () => {
    expect(out('where-is-the-station.conllu')).toBe('Kde jest stancija?');
  });

  it('does not reorder a statement', () => {
    expect(out('read-the-book.conllu')).toBe('Pročitajte knigu.');
  });
});

/**
 * "Except for adjectives referring to masculine, animate nouns, the nominate
 * and accusative plural are identical for all genders."
 * http://steen.free.fr/interslavic/adjectives.html
 *
 * Van Steenbergen's Maly princ contrasts the two endings in one sentence:
 * "Vse kury sųt jednakove i vsi ljudi sųt jednakovi".
 */
describe('a predicate agreeing with a person', () => {
  it('takes the masculine animate plural', () => {
    // Was "My jesmo utomljene" - the ending for everything that is not a
    // masculine animate.
    expect(out('we-are-tired.conllu')).toBe('My jesmo utomljeni.');
  });

  it('still takes the plain plural for a non-person subject', () => {
    expect(out('the-women-are-tired.conllu')).toBe('Ženy sut utomljene.');
  });

  it('agrees with oni as the masculine animate plural the pronouns page makes it', () => {
    /**
     * This used to assert "Oni sut utomljene", reasoning from the dictionary's
     * gloss "they (masculine or mixed)" that `oni` may stand for things. The
     * pronouns page outranks that gloss, and its table heads the two plurals
     * "masc.anim." (`oni`) and "other" (`one`); van Steenbergen's UDHR writes
     * "Oni sųt obdarjeni". So the predicate agrees with the pronoun actually
     * written. Whether a "they" for things should be `one` instead is the open
     * question - the engine never chooses `one` - but that is the pronoun's
     * choice, not the predicate's.
     */
    expect(out('they-are-tired.conllu')).toBe('Oni sut utomljeni.');
  });
});

/**
 * A recipient "to" is a bare dative; a destination is not. Both were datives,
 * because "the verb has a direct object" was the whole test.
 */
describe('recipient "to"', () => {
  it('is a dative even when the phrase hangs off the object noun', () => {
    // Stanza makes "mother" an `nmod` of "letter", not an `obl` of "wrote", so
    // reading only the verb's dependents gave "do svojej matere".
    expect(out('wrote-a-letter-to-mother.conllu')).toBe('On napisal pismo svojej materi.');
  });

  it('is not read into a verb that takes no recipient', () => {
    // Was "Ja jesm vzel knigu Rimu" - a destination in the dative.
    expect(out('took-the-book-to-rome.conllu')).toContain('do Rima');
  });

  it('covers verbs of transfer and communication only', () => {
    for (const v of ['give', 'send', 'write', 'tell']) {
      expect(RECIPIENT_VERB_LEMMAS, v).toContain(v);
    }
    for (const v of ['take', 'go', 'walk', 'be']) {
      expect(RECIPIENT_VERB_LEMMAS, v).not.toContain(v);
    }
  });
});

/**
 * Only a predicate ADJECTIVE agrees with the subject. A predicate NOUN keeps
 * its own gender, number and animacy - those are lexical facts about the noun,
 * not properties of the position it stands in.
 *
 * Found while auditing citation-form fallbacks: "It is a good book" was asking
 * the morphology for a NEUTER `kniga`, having copied the gender of `ono`. The
 * output was right only by accident - a noun's form is not selected by gender,
 * and the adjective had already agreed with `kniga` in the earlier pass.
 */
describe('a predicate noun', () => {
  it('keeps its own lexical gender', () => {
    const r = translate(
      parseConllu(
        fs.readFileSync(
          path.join(import.meta.dirname, 'fixtures/parse/en/it-is-a-good-book.conllu'),
          'utf8',
        ),
      ),
      lex,
      { orthography: 'standard' },
    );
    // The subject is the presenting "To" now; what this guards is kniga's own
    // feminine, below.
    expect(r.text).toBe('To jest dobra kniga.');
    const book = r.words.find((w) => w.sourceForm === 'book');
    const gender = book?.features.find((f) => f.name === 'Gender');
    expect(gender?.value).toBe('Fem');
    expect(gender?.because).toContain('lexical property');
  });

  it('still takes the nominative, which the position does decide', () => {
    const r = translate(
      parseConllu(
        fs.readFileSync(
          path.join(import.meta.dirname, 'fixtures/parse/en/it-is-a-good-book.conllu'),
          'utf8',
        ),
      ),
      lex,
      { orthography: 'standard' },
    );
    const book = r.words.find((w) => w.sourceForm === 'book');
    expect(book?.features.find((f) => f.name === 'Case')?.value).toBe('Nom');
  });

  it('still agrees a predicate ADJECTIVE with its subject', () => {
    expect(out('the-women-are-tired.conllu')).toBe('Ženy sut utomljene.');
    expect(out('we-are-tired.conllu')).toBe('My jesmo utomljeni.');
  });
});
