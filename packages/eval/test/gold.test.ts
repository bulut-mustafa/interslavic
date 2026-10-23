import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate } from '../../engine/src/pipeline.ts';

/**
 * Measures MEANING, which the full-form lexicon cannot.
 *
 * Every sentence here is Interslavic written by Jan van Steenbergen, the
 * language's co-author, on his own grammar pages. Our job is to reproduce his
 * Interslavic from his English.
 *
 * This exists because self-validation proved insufficient: "Kak ty dělaješ?"
 * scored 100% validated - every word real, every case justified - and was still
 * the wrong translation. Form and meaning are separate questions, and only gold
 * data answers the second one.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const validator = buildFullFormIndex(lex);
const GOLD = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'packages/eval/data/gold-steenbergen.json'), 'utf8'),
) as {
  pairs: {
    id: string;
    /** Present for an English pair; a Russian pair carries `ru` instead. */
    en?: string;
    ru?: string;
    lang?: string;
    isv: string;
    page: string;
    tests: string[];
    /** For a Russian pair, the English pair whose target it mirrors. */
    of?: string;
  }[];
};

/** The source sentence of a pair, whichever language it is in. */
const source = (p: { en?: string; ru?: string }): string => p.en ?? p.ru ?? '';

const FIXTURES = path.join(ROOT, 'packages/engine/test/fixtures/parse/gold');

/**
 * Terminal punctuation is deliberately not compared. Several grammar pages
 * give their examples inline, mid-sentence, with no final period, so requiring
 * one would measure our punctuation handling instead of the translation. That
 * punctuation IS carried over is asserted separately, in the pipeline tests.
 */
const key = (s: string): string => s.trim().toLowerCase().replace(/[.!?\u2026]+$/, '');

const ours = (id: string): string => {
  const sentence = parseConllu(fs.readFileSync(path.join(FIXTURES, `${id}.conllu`), 'utf8'));
  return translate(sentence, lex, { orthography: 'standard', validator }).text;
};

const matches = (p: { id: string; isv: string }): boolean => key(ours(p.id)) === key(p.isv);

/**
 * Every difference from gold, classified. A pair that does not match and is
 * NOT listed here fails the suite, and so does a listed pair that has started
 * matching - a stale excuse is worse than no excuse.
 *
 *   acceptable  - a documented equivalent; the grammar permits both
 *   defect      - we are wrong, and the cause is named
 *   unsupported - the construction is not built yet
 *   parser      - the UD parse itself is wrong, so transfer never had a chance
 */
type Status = 'acceptable' | 'defect' | 'unsupported' | 'parser';
const DIFFERENCES: Record<string, { status: Status; why: string }> = {
  g30: {
    status: 'defect',
    why: 'idiom - "nobody but myself" is rendered literally with negative concord ("ne myju nikogo ale se") where the page writes "jedino sebe", i.e. "only myself". Needs the English idiom, not a grammar rule',
  },
  g31: {
    status: 'defect',
    why: 'an UNTRANSLATED proper noun cannot be inflected: "Ivan" is not in the dictionary, so it is passed through as the source form and the recipient dative is lost ("dal Ivan" for "dal Ivanu"). Everything else matches, including `svoju`',
  },
  g32: {
    status: 'acceptable',
    why: 'lexical choice - we pick `pojdti` (go on foot), the page `pojehati` (go by vehicle). English "has gone" says neither',
  },
  g33: {
    status: 'defect',
    why: 'the PRESENT ACTIVE PARTICIPLE is not built: "While going to her work" becomes a subordinate clause ("Dokolě ide do ...") where the page writes the participle "Iduči". The library computes these and the token layer discards them, the same gap the l-participle had. Also `kuri cigaretu` for `dymi cigaretoju` - a bare instrumental of means',
  },
  g34: {
    status: 'defect',
    why: 'multiword - "take photos" should resolve to the single verb `fotografovati` rather than `brali fotografije`. Also "the Netherlands" is plural in English and singular in Interslavic (`Niderlandy` for `Niderlandiju`), which needs a lexical number override',
  },
  g35: {
    status: 'defect',
    why: 'aspect only - `prinesla` (perfective) for `prinosila` (imperfective); "brought" is telic so the perfective is defensible. The construction itself is now right: the doubled conditional ("da by děti BY byli") was fixed by dropping a `would` whose purpose clause already supplies `by`',
  },
  'g05-ru': {
    status: 'defect',
    why: 'dictionary data - `kino` is a borrowing and should be indeclinable, as the nouns page says of borrowed vocabulary, but the entry is plain `n.` so it declines to `kinu`',
  },
  'g08-ru': {
    status: 'acceptable',
    why: 'lexical choice - Russian "пришёл" is arrival on foot, so we pick `prijdti`; the page writes `prijehati` for the English "came to the party". Both are "came"',
  },
  'g22-ru': {
    status: 'parser',
    why: 'Stanza lemmatises Russian "мою" as the possessive `мой` rather than the verb `мыть` - the two are spelled identically - so the sentence has no verb at all. Adding a full stop fixes the tokenisation but not this',
  },
  'g23-ru': {
    status: 'parser',
    why: 'same "мою" ambiguity as g22-ru',
  },
  g02: {
    status: 'acceptable',
    why: 'word order only - Interslavic word order is free, and subject-verb order is equally grammatical',
  },
  g05: {
    status: 'acceptable',
    why: 'preposition choice - we produce "do kina" (do + genitive); both express motion to a place',
  },
  g06: {
    status: 'acceptable',
    why: 'lexical choice - we pick "voz", also glossed "car" and more frequent than "avto"; our output agrees internally (voz is masculine, so "dragy")',
  },
  g08: {
    status: 'defect',
    why: 'word sense - we pick "partija", the POLITICAL sense of "party". No signal in the dictionary separates it from "zabava": both are type 1 with the bare gloss "party", and frequency favours the wrong one',
  },
  g11: {
    status: 'parser',
    why: 'Stanza makes "does" the root VERB with "love" as its xcomp, so do-support is never recognised. Five comparable questions ("Does he know the answer?", "Which book does she read?") all parse correctly, so this is an isolated parse error, not a systemic one',
  },
  g13: {
    status: 'defect',
    why: 'the modal, the possessive and the negative concord are now right ("ne mogl ... svoje ... nikde"); two causes remain - the verb is imperfective "nahoditi" where the gold has perfective "najdti", and "nikde" sits after the object rather than before the verb (word order is free, but the gold reads better). Our "ključe" is NOT a defect: the nouns page states "animate nouns have the nominative plural ending -i instead of the ending -y/-e of inanimate nouns" and tables inanimate soft kraj -> kraje, so ključe is table-conformant; the gold\'s "ključi" appears in no paradigm table, and the reference engine gives ključe too',
  },
  g14: {
    status: 'defect',
    why: '"going to" is not recognised as a future, so we emit "idu čitati" rather than "budu čitati", and "anymore" is passed through as raw English',
  },
  g15: {
    status: 'defect',
    why: 'the construction is now right ("..., že by brali ...") - what remains is lexical: "visit" resolves to "navědžajut" rather than "posětet", and "take photos" to "brali fotografije" rather than the single verb "fotografovali"',
  },
  g19: {
    status: 'defect',
    why: 'the case is now right ("pod stol", accusative for motion); what remains is lexical - "fled" resolves to "izběgal" (escaped/avoided) rather than "poběgl"',
  },
  g21: {
    status: 'defect',
    why: 'word sense - "drive" resolves to "gnati" (to drive cattle, to chase) rather than "jezditi" (to travel by vehicle), and the particle "around" is translated as a separate adverb instead of being carried by "po" + locative',
  },
  g22: {
    status: 'defect',
    why: 'svoj and the verb are now correct ("Ja myju svoj ..."); what remains is the noun - "car" resolves to "voz", also glossed "car" and more frequent than "avto", which also makes our agreement masculine where the gold is neuter',
  },
  g24: {
    status: 'acceptable',
    why: 'the gender is now right ("ščestlivy"), and the LONG form is what the adjectives page recommends: the short form "may also be used [...] This is not mandatory though, and in most cases, people will simply write: Petr jest ščestlivy". "Peter" stays as written because the dictionary carries no personal names and no source gives a transcription rule for them - keeping an unknown proper noun is the correct behaviour, and it is flagged as untranslated',
  },
  g25: {
    status: 'defect',
    why: 'word sense - "floor" resolves to "podloga" (the surface) rather than "etaž" (the storey). The declined numeral is NOT a defect: the numerals page calls leaving cardinals undeclined "the easiest solution [...] even though it may sound a little strange to native speakers. However, a better effect can be achieved by using the following declension patterns", so our "trěmi" is the better form',
  },
  g26: {
    status: 'defect',
    why: '"Some people" becomes "Několiko osoby" rather than "Jedni ljudi" (jedin in the plural), and the elliptical second clause is not handled',
  },
};

describe("gold: van Steenbergen's own Interslavic", () => {
  it('has a fixture for every gold pair', () => {
    // A floor, not an equality: adding a pair must never fail the suite.
    expect(GOLD.pairs.length).toBeGreaterThanOrEqual(49);
    for (const p of GOLD.pairs) {
      expect(fs.existsSync(path.join(FIXTURES, `${p.id}.conllu`)), p.id).toBe(true);
    }
  });

  it('reproduces every pair whose difference is not classified', () => {
    const unexplained = GOLD.pairs
      .filter((p) => !matches(p) && !(p.id in DIFFERENCES))
      .map((p) => `${p.id} ${source(p)}\n    gold: ${p.isv}\n    ours: ${ours(p.id)}`);
    expect(unexplained).toEqual([]);
  });

  it('keeps no stale classification for a pair that now matches', () => {
    const stale = Object.keys(DIFFERENCES).filter((id) => {
      const p = GOLD.pairs.find((x) => x.id === id);
      return p !== undefined && matches(p);
    });
    expect(stale).toEqual([]);
  });

  it('classifies every difference against a real pair, with a reason', () => {
    for (const [id, d] of Object.entries(DIFFERENCES)) {
      expect(GOLD.pairs.some((p) => p.id === id), `${id} is not a gold pair`).toBe(true);
      expect(d.why.length, `${id} has no reason`).toBeGreaterThan(20);
    }
  });

  it('does not regress below the exact-match rate we have reached', () => {
    const matched = GOLD.pairs.filter(matches).length;
    // History: 1/10 when meaning was first measured, 6/10 after the first five
    // grammar fixes. The set then grew from 10 to 29 pairs, widening coverage to
    // constructions the syntax page never exercised: 10/29, then 11/29 once a
    // plurale tantum stopped being given a singular numeral, 12/29 once an
    // unsupported sense label stopped outranking an unlabelled gloss, and
    // 13/29 once final clauses were built, 14/29 with the optative, 15/29 with
    // the passive.
    // 15/29 held for a while; the set then grew to 49 pairs - 35 English, now
    // exhausting the grammar pages for sentence-level examples, plus 14 Russian
    // whose TARGET is his own Interslavic and only whose source changes. 25/49.
    // Raise this floor as it improves; never lower it.
    expect(matched).toBeGreaterThanOrEqual(25);
  });

  it('counts how much of the gap is ours', () => {
    const by = (s: Status) => Object.values(DIFFERENCES).filter((d) => d.status === s).length;
    // Not an assertion about quality - a tripwire, so that silently
    // reclassifying a defect as "acceptable" shows up as a failing test.
    expect({ acceptable: by('acceptable'), defect: by('defect'), unsupported: by('unsupported'), parser: by('parser') })
      .toEqual({ acceptable: 6, defect: 15, unsupported: 0, parser: 3 });
  });
});

describe('the grammar bugs the gold data exposed', () => {
  // Each of these was wrong until the gold comparison caught it. They are
  // asserted individually so a regression names the specific rule.

  it('requires `ne` even beside a negative word (negative concord)', () => {
    expect(ours('g07')).toBe('Ja nikogda ne jem čokoladu.');
  });

  it('puts `ne` before the verb, not after it', () => {
    expect(ours('g10')).toBe('Tutoj hlěb ne jest dragy.');
    expect(ours('g10')).not.toContain('jest ne');
  });

  it('reads the English perfect as perfective', () => {
    expect(ours('g01')).toBe('Otec kupil knigu?'); // kupil, not kupoval
  });

  it('finds the tense on the auxiliary when the verb has none', () => {
    // "Where DID father buy..." - only "did" carries Past.
    expect(ours('g03')).toBe('Kde otec kupil tu knigu?');
  });

  it('treats infinitival "to" as a marker, not the preposition `do`', () => {
    expect(ours('g05')).toContain('hoču idti');
    expect(ours('g05')).not.toContain('hoču do');
  });

  it('uses the plain demonstrative, not the distal one', () => {
    // "tamto" means "that over there"; plain "that" is tȯj.
    expect(ours('g04')).toBe('Koja žena ljubi togo muža?');
    expect(ours('g03')).not.toContain('tamtu');
  });
});

describe('the compound past', () => {
  // From steen.free.fr/interslavic/verbs.html: "Most commonly used is the
  // compound past" - ja jesm dělal · ty jesi dělal · on dělal · my jesmo dělali
  // - and "in the third person, the forms of byti are usually omitted".
  // We previously omitted the auxiliary in EVERY person.
  const ROOT2 = path.resolve(import.meta.dirname, '../../..');
  const fixture = (name: string) =>
    translate(
      parseConllu(
        fs.readFileSync(
          path.join(ROOT2, 'packages/engine/test/fixtures/parse/en', name),
          'utf8',
        ),
      ),
      lex,
      { orthography: 'standard', validator },
    ).text;

  it('omits the auxiliary in the third person', () => {
    expect(fixture('woman-read-book.conllu')).toBe('Žena pročitala knigu.');
  });

  it('includes the auxiliary in the first person', () => {
    expect(fixture('i-have-finished.conllu')).toBe('Ja jesm zakončil knigu.');
  });

  it('takes person from the SUBJECT, not the auxiliary', () => {
    // Stanza tags "did" as Person=2 in "Where did father buy that book?".
    // Trusting it produced "Kde otec jesi kupil tu knigu?" - a 2nd-person
    // auxiliary for a 3rd-person subject.
    expect(ours('g03')).toBe('Kde otec kupil tu knigu?');
    expect(ours('g03')).not.toContain('jesi');
  });
});
