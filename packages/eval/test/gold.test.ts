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
  g32: {
    status: 'acceptable',
    why: 'lexical choice - we pick `pojdti` (go on foot), the page `pojehati` (go by vehicle). English "has gone" says neither',
  },
  g33: {
    status: 'acceptable',
    why: 'the participle ("Iduči", the transgressive), the noun ("raboty", curated for work one goes to) and the comma are now right. Two choices remain, both faithful: "svojej" translates the English "her", which the page leaves unexpressed, and it is what the pronouns page prescribes: "Whenever the possessor is also the subject of the sentence, the reflexive svoj is used"; and "kuriti cigaretu" is the verb the dictionary marks transitive ("kuriti v.tr. ipf. smoke"), with its accusative object, where the page writes the intransitive "dymiti" ("v.intr. ipf. smoke") with an instrumental. Both verbs are type 1 and glossed exactly "smoke"',
  },
  g34: {
    status: 'acceptable',
    why: 'the construction and the verb are now right ("že by fotografovali tulipany": "take photos" is one verb, rules/src/light-verbs.ts). Two forms differ, both following our sources: "Niderlandy" is the dictionary\'s own entry ("Niderlandy m.pl. Netherlands"), and "Niderlandija" is not in it; and "Turisti" is the animate nominative plural the nouns page states ("animate nouns have the nominative plural ending -i"), which the page itself writes in the present-tense version of this sentence (g15)',
  },
  g35: {
    status: 'acceptable',
    why: 'aspect only - `prinesla` (perfective) for `prinosila` (imperfective). English "brought" does not say whether it was one delivery or a habit; the perfective is the one-delivery reading, which the verbs page defines as focusing "on the result of an action [...] the action has been completed", and the habitual reading the page chose is the alternative our gloss names. The construction itself is now right: the doubled conditional ("da by děti BY byli") was fixed by dropping a `would` whose purpose clause already supplies `by`',
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
  g08: {
    status: 'acceptable',
    why: 'the noun ("zabava", curated for a party one comes to) and the aspect (perfective "prišel" for a movement that reached its goal) are now right. Two choices remain, both defensible: "do zabavy" follows the prepositions page ("do - to, towards", prepositions by "logical meaning, not [...] national idioms") where the page writes the idiom "na zabavu"; and "prijehal" means arriving by vehicle, which the English does not say, where "prišel" is the plain perfective of "come" (verbs page: "prihoditi (impf.)/ prijdti (pf.) „to come”")',
  },
  g11: {
    status: 'parser',
    why: 'Stanza makes "does" the root VERB with "love" as its xcomp, so do-support is never recognised. Five comparable questions ("Does he know the answer?", "Which book does she read?") all parse correctly, so this is an isolated parse error, not a systemic one',
  },
  g13: {
    status: 'defect',
    why: 'the modal, the possessive and the negative concord are now right ("ne mogl ... svoje ... nikde"); two causes remain - the verb is imperfective "nahoditi" where the gold has perfective "najdti" (UD gives "could" no Tense, and treating the object of every past modal as completed would make the ABILITY reading - "He could read books", "mogl čitati" - wrongly perfective, so this stays the visible aspect guess), and "nikde" sits after the object rather than before the verb (word order is free, but the gold reads better). Our "ključe" is NOT a defect: the nouns page states "animate nouns have the nominative plural ending -i instead of the ending -y/-e of inanimate nouns" and tables inanimate soft kraj -> kraje, so ključe is table-conformant; the gold\'s "ključi" appears in no paradigm table, and the reference engine gives ključe too',
  },
  g14: {
    status: 'acceptable',
    why: 'word order only. Every word is now right - "budu čitati" for the periphrastic future, "nijednu knigu" for the negated "a single book", and "uže" for "anymore" - but `uže` stays where the English "anymore" stood, at the end, where the gold puts it before the negation complex ("Ja uže nikogda ne"). The syntax page opens with "Word order is basically free", and g13 is classified the same way for the same reason, so this is not counted as a defect. The tighter reading of `uže ne` as "no longer" would be better served by the gold order, which is why it is listed here rather than ignored',
  },
  g15: {
    status: 'acceptable',
    why: 'the construction and "fotografovali tulipany" are now right. Two choices remain: "Niderlandy" is the dictionary\'s own entry (see g34); and the page writes the perfective present "posětet" for a general truth, where we keep every English present imperfective ("posěčajut"), because the verbs page warns that a perfective present reads as a future - the trade-off aspect.tense.presImp records',
  },
  g19: {
    status: 'acceptable',
    why: 'the aspect is now right (perfective, a movement that reached its goal) and the case too ("pod stol"). The verb differs: "izběgl" where the page writes "poběgl", but the dictionary glosses izběgti exactly "escape, flee", so it is a faithful translation of "fled"; poběgti is glossed "run"',
  },
  g24: {
    status: 'acceptable',
    why: 'the gender is now right ("ščestlivy"), and the LONG form is what the adjectives page recommends: the short form "may also be used [...] This is not mandatory though, and in most cases, people will simply write: Petr jest ščestlivy". "Peter" stays as written because the dictionary carries no personal names and no source gives a transcription rule for them - keeping an unknown proper noun is the correct behaviour, and it is flagged as untranslated',
  },
  g25: {
    status: 'acceptable',
    why: 'the noun is now right ("etaž", curated for a counted floor), so only the numeral differs, and the declined numeral is NOT a defect: the numerals page calls leaving cardinals undeclined "the easiest solution [...] even though it may sound a little strange to native speakers. However, a better effect can be achieved by using the following declension patterns", so our "trěmi" is the better form',
  },
  g26: {
    status: 'parser',
    why: 'Stanza parses the elliptical second clause as "others" a descriptive modifier of "Winter", and "Winter" an apposition of "Summer" - there is no clause left whose subject "others" could be, so "drugi zimu" cannot be built. Our own part is now "Několiko ljudij" ("people" read as ljudi, in the genitive after the indefinite numeral, as the page writes "osmero ljudij"). Two word choices also differ: the page uses plural "jedni" for the contrastive "some ... others", and "prědpočitati" where we pick "preferovati" (both glossed "prefer"; preferovati is type 1, prědpočitati type 2)',
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
    // whose TARGET is his own Interslavic and only whose source changes. 26/49,
    // then 28/49 once a word the dictionary marks as not understood in 4+
    // languages stopped winning on frequency ("voz" -> "avto"), 29/49 once a
    // name the dictionary lacks was declined by its ending ("Ivanu"), 30/49
    // once driving around in a place became "jezdil po Moskvě".
    // Raise this floor as it improves; never lower it.
    expect(matched).toBeGreaterThanOrEqual(30);
  });

  it('counts how much of the gap is ours', () => {
    const by = (s: Status) => Object.values(DIFFERENCES).filter((d) => d.status === s).length;
    // Not an assertion about quality - a tripwire, so that silently
    // reclassifying a defect as "acceptable" shows up as a failing test.
    expect({ acceptable: by('acceptable'), defect: by('defect'), unsupported: by('unsupported'), parser: by('parser') })
      .toEqual({ acceptable: 13, defect: 2, unsupported: 0, parser: 4 });
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
