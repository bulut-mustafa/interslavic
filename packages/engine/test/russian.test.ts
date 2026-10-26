import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon, rank } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { EN, RU } from '../src/source/adapters.ts';
import { personalPronounLemma } from '../../rules/src/pronouns.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/ru', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const out = (name: string) => result(name).text;

/**
 * The Russian source side had two fixtures and almost no verification. These
 * are the defects that audit found. Several share one cause: a rule that states
 * an INTERSLAVIC fact was gated to `lang === 'en'`, so Russian never reached
 * it.
 */
describe('the Russian gloss column', () => {
  /**
   * It was split on bare commas while the English column had a
   * parenthesis-aware splitter. 35 rows were cut inside a parenthesis,
   * producing keys like "лекарь (разг." that nothing matches, and 9 entries
   * were left with no usable Russian key at all.
   */
  it('is parsed with the same splitter as the English column', () => {
    let unbalanced = 0;
    for (const e of lex.entries) {
      for (const g of e.ruGlosses) {
        if (/\(/.test(g.text) !== /\)/.test(g.text)) unbalanced++;
      }
    }
    expect(unbalanced).toBe(0);
  });

  it('finds "они", which had no usable key at all', () => {
    // Its cell is "они (муж. род, смешанный род)" - every comma is inside the
    // parenthesis, so the bare split produced two unusable fragments. Every
    // other personal pronoun worked, which is why it went unnoticed.
    expect(rank(lex.lookup('они', 'ru'), { gloss: 'они', lang: 'ru' })[0]?.lemma).toBe('oni');
    expect(out('oni-zhivut.conllu')).toBe('Oni živut tu deset rokov.');
  });

  it('finds the other senses those rows lost', () => {
    for (const [ru, isv] of [
      ['лекарь', 'lěkaŕ'],
      ['окромя', 'kromě'],
    ] as const) {
      expect(lex.lookup(ru, 'ru').map((e) => e.lemma), ru).toContain(isv);
    }
  });

  it('carries a sense label, as the English column does', () => {
    const pismo = lex.entries.find((e) => e.lemma === 'piśmo' && e.glosses[0]?.text === 'letter');
    expect(pismo?.ruGlosses[0]).toMatchObject({ text: 'письмо', sense: 'почта' });
  });
});

/**
 * "Interslavic has got T-V distinction, i.e. vy is a universal second person
 * pronoun for both numbers, whereas the second person singular ty is used only
 * for addressing friends, relatives and children."
 * http://steen.free.fr/interslavic/pronouns.html
 *
 * From English, `ty` would assert an intimacy "you" does not contain. From
 * Russian, `ты` states it, and rendering it `vy` makes an informal sentence
 * formal.
 */
describe('the second person', () => {
  it('keeps the distinction Russian makes', () => {
    expect(out('ty-chitaesh.conllu')).toBe('Ty čitaješ knigu.');
    expect(out('vy-chitaete.conllu')).toBe('Vy čitajete knigu.');
  });

  it('is read from the source adapter, not from a hardcoded language check', () => {
    expect(RU.marksSecondPersonNumber).toBe(true);
    expect(EN.marksSecondPersonNumber).toBe(false);
  });

  it('still defaults to `vy` for a source that does not distinguish', () => {
    const feats = { PronType: 'Prs', Person: '2', Number: 'Sing' };
    expect(personalPronounLemma(feats, false)).toBe('vy');
    expect(personalPronounLemma(feats, true)).toBe('ty');
  });

  it('conjugates the verb for the number the pronoun really has', () => {
    // `personalPronounNumber('vy')` is Plur, so a `vy` forced from `ты` made
    // the verb plural too - "Ty čitajete".
    const verb = result('ty-chitaesh.conllu').words.find((w) => w.sourceForm === 'читаешь');
    expect(verb?.features.find((f) => f.name === 'Number')?.value).toBe('Sing');
  });
});

/**
 * Russian and Interslavic govern numerals differently, and the Russian case is
 * not transferable: Russian writes "два брата" with a genitive singular and
 * "пять братьев" with a genitive plural, while the numerals page gives the
 * nominative plural after 2-4 and the genitive plural after 5.
 *
 * The phase did not run for Russian at all, because it tested `deprel !==
 * 'nummod'` and Russian uses the subtype `nummod:gov`.
 */
describe('numerals from Russian', () => {
  it('uses the nominative plural after 2-4', () => {
    // Was "dvě brata" - the wrong numeral gender and the Russian paucal case.
    // `sut`: "У меня два брата" has no verb, and the copula pass supplies the
    // one Interslavic writes. See "the copula Russian omits" below.
    expect(out('dva-brata.conllu')).toBe('U mene sut dva brati i jedna sestra.');
    expect(out('tri-knigi.conllu')).toBe('Ja vidžu tri knigy.');
  });

  it('uses the genitive plural after 5', () => {
    expect(out('pjat-bratjev.conllu')).toBe('U mene sut pet bratov.');
  });

  /**
   * With a preposition the case the source marks is the PREPOSITION's, which
   * does transfer - Russian prepositions are not planned precisely because the
   * source states the case. Discarding it gave "s tri knigy".
   */
  it('keeps a preposition-governed case', () => {
    expect(out('s-tremja-knigami.conllu')).toContain('s trěmi knigami');
  });
});

/** Rules that state an Interslavic fact, wrongly gated to English. */
describe('rules that are not English-specific', () => {
  it('keeps a source-marked infinitive an infinitive', () => {
    // Russian writes a bare infinitive with no "to" to require, so demanding a
    // `mark` conjugated it: "Мы должны уйти" became "My dolžni ujdemo".
    /**
     * `jesmo dolžni` because Russian omits the copula and Interslavic writes
     * it - and the dictionary's own entry for this is `byti dȯlžėn` ("have to,
     * ought to"), whose first word is `byti`. So the inserted copula is not
     * merely grammatical here, it completes the lexical construction.
     */
    expect(out('dolzhny-ujti.conllu')).toBe('My jesmo dolžni ujdti do polnoči.');
  });

  it('uses an imperative for a source imperative, with the source number', () => {
    // Was the present tense "Otvoriš okno". Russian distinguishes the number,
    // and overriding it would change the register.
    expect(out('otkroj-okno.conllu')).toBe('Otvori okno.');
    expect(out('otkrojte-okno.conllu')).toBe('Otvorite okno.');
  });

  it('uses `že` for a Russian complementizer', () => {
    // "что" reached the interrogative: "Ona skazala mně čego ona ustala".
    /**
     * `umorila se`, not `ustala`: both are glossed "get tired" and the
     * dictionary lists `устать` for both, so this is lexical variation rather
     * than a change in meaning. It moved because a trailing reflexive clitic
     * no longer counts as a second word for the single-word preference - the
     * change that made Russian "нравиться" resolve to `podobati sę` instead of
     * taking `prijati` plus an inserted clitic.
     */
    // The Russian comma is carried over; his own prose writes it too: "možemo
    // iměti naděju, že vsi interesujut se nami" (steen.free.fr/interslavic/selo.html).
    expect(out('skazala-chto.conllu')).toBe('Ona skazala mně, že ona umorila se.');
    expect(RU.complementizers).toContain('что');
  });

  it('uses `ktory` for a Russian relative pronoun, agreeing with its antecedent', () => {
    // `который` carries PronType=Rel exactly as English "which" does.
    expect(out('kniga-kotoruju.conllu')).toContain('ktoru');
  });
});

/**
 * Russian omits the present-tense copula and Interslavic writes it, as every
 * example on the syntax page does: "Petr jest ščestliv", "dom jest velik",
 * "Tuto avto ne jest drago".
 */
describe('the copula Russian omits', () => {
  it('is inserted, agreeing with the subject', () => {
    expect(out('on-doktor.conllu')).toBe('On jest doktor.');
    expect(out('my-studenty.conllu')).toBe('My jesmo studenti.');
  });

  it('follows the opening constituent, wherever that is', () => {
    /**
     * Four placements were tried and measured. Keyed to the predicate's head it
     * landed inside the phrase ("On najlěpši jest student"); keyed to the
     * phrase's first word it became clause-initial ("Jest kde stancija?");
     * shifted by one word it split a prepositional phrase ("U sut mene dva
     * brati"); and excluding every `nsubj` from the opening constituent broke
     * a relative clause ("Kniga ktoru jest ja čitaju interesna").
     */
    expect(out('samyj-luchshij.conllu')).toBe('On jest najlěpši student.');
    // Both commas of the Russian relative clause are carried over, as in "Malo
    // spoločenstvo, ktorym jest selska občina, jest ..." (selo.html).
    expect(out('kniga-kotoruju.conllu')).toBe('Kniga, ktoru ja čitaju, jest interesna.');
    expect(out('kde-stancija.conllu')).toBe('Kde jest stancija?');
  });

  it('is inserted in a verbless clause whose root is not a nominal', () => {
    // "Где станция?" has an ADV root, which predicate agreement never looks
    // at, so it came out verbless as "Kde stancija?" while English - whose
    // source supplies "is" - gave "Kde jest stancija?".
    expect(out('kde-stancija.conllu')).toContain('jest');
  });

  it('is not added where the source already has a verb', () => {
    // "была" is in the parse, so this is a past passive, not a bare predicate.
    expect(out('eda-byla-prigotovlena.conllu')).toBe('Jeda byla prigotovjena mojeju baboju.');
  });

  it('is reported as an inserted word with its reason', () => {
    const cop = result('on-doktor.conllu').words.find((w) => w.sourceForm === '(copula)');
    expect(cop?.surface).toBe('jest');
    expect(cop?.features[0]?.because).toContain('omits the present-tense copula');
  });
});

describe('the Russian periphrastic future', () => {
  it('becomes budu + infinitive', () => {
    // "буду" is AUX with the lemma `быть`, which the English will/shall table
    // never saw: "Я буду читать" came out as "Ja jesi čitaju".
    expect(out('budu-chitat.conllu')).toBe('Ja budu čitati knigu.');
    expect(RU.futureAuxiliaryLemma).toBe('быть');
  });

  it('does not touch `быть` with a participle, which is the past copula', () => {
    expect(out('eda-byla-prigotovlena.conllu')).toContain('byla prigotovjena');
  });

  /**
   * The `VerbForm=Inf` guard is insurance, not dead code. Stanza labels a
   * Russian `быть` `aux` ONLY when its head is an infinitive - verified over
   * six constructions, where the passive gets `aux:pass` and a nominal
   * predicate gets `cop` - so no real parse reaches it. The fixture is
   * hand-written for exactly that reason, the same way `selectForm`'s
   * tie-break is tested with synthetic input rather than left uncovered.
   *
   * Without the guard a participle would be rewritten as a periphrastic
   * future, turning a past passive into "будет" + infinitive.
   */
  it('refuses a participle head even if the parse labels it `aux`', () => {
    const text = out('synthetic-byt-aux-participle.conllu');
    // Without the guard this is "Dom BUDE sbudovany" - a future built out of a
    // past passive. The participle itself must survive either way.
    expect(text).toContain('sbudovany');
    expect(text).not.toMatch(/\bbud/);
  });
});

describe('the Russian analytic superlative', () => {
  it('becomes the naj- prefix and the marker is deleted', () => {
    // Was "sama veliky dom" - a stray pronoun beside an uncompared adjective.
    const r = result('samyj-luchshij.conllu');
    expect(r.text).toContain('najlěpši');
    expect(r.dropped.map((d) => d.why).join(' ')).toContain('prefix naj-');
  });

  it('is declared by the adapter, and English has none', () => {
    expect(RU.analyticSuperlative).toBe('самый');
    expect(EN.analyticSuperlative).toBeNull();
  });
});

/**
 * A second round of Russian defects, found by sweeping 40 ordinary sentences
 * across aspect, voice, mood, comparison, numerals and impersonals.
 */
describe('comparison from Russian', () => {
  /**
   * Adverbs are marked `indeclinable`, so they took an early return before the
   * Degree block and lost their comparison entirely. A comparative is a
   * different LEMMA (`bystro` -> `bystrěje`), not an inflected form, which is
   * why an indeclinable can still carry one. English comparative adverbs
   * ("faster", "sooner") had the same bug.
   */
  it('compares an adverb', () => {
    expect(out('chitaet-bystree.conllu')).toContain('bystrěje');
  });

  /**
   * "больше" is its own lemma, so the entry it matches (`veče`, glossed "more")
   * is ALREADY a comparative; deriving again gave "večeje". "быстрее" has the
   * lemma `быстро` and "старше" has `старший`, so both do derive.
   */
  it('does not compare a word that is already comparative', () => {
    expect(out('dom-bolshe-togo.conllu')).not.toContain('večeje');
    expect(out('starshe-menja.conllu')).toContain('starějši');
  });

  /**
   * Russian marks the standard of comparison with a bare genitive; Interslavic
   * uses `od`, which is how van Steenbergen writes it: "trěba jest uznati za
   * silnějšego od drugogo".
   */
  it('joins the standard of comparison with "od"', () => {
    expect(out('dom-bolshe-togo.conllu')).toBe('Toj dom jest veče od togo doma.');
    expect(out('starshe-menja.conllu')).toContain('od mene');
  });

  it('puts "od" before the whole phrase, not before its head', () => {
    // Keyed to the head it landed after the determiner: "veče togo od doma".
    expect(out('dom-bolshe-togo.conllu')).toContain('od togo doma');
  });

  it('does not add "od" where a preposition already governs the phrase', () => {
    // "на два года" hangs off the comparative too, and took "od" as well.
    expect(out('starshe-menja.conllu')).toBe('On jest starějši od mene na dva roky.');
  });
});

/**
 * `Mood=Cnd` is a UD feature, so this needs no lemma list. Russian "бы" was
 * reaching the lexical path, and the compound-past auxiliary was emitted beside
 * it: "Jestli by ja jesm znal ja by jesm prišel".
 */
describe('the Russian conditional', () => {
  it('becomes byh/bys/by and suppresses the compound past', () => {
    expect(out('esli-by-ja-znal.conllu')).toBe('Jestli byh ja znal, ja byh prišel.');
    expect(out('hotel-by-chitat.conllu')).toBe('Ja hotěl byh čitati.');
  });

  it('leaves no compound-past auxiliary behind', () => {
    expect(out('esli-by-ja-znal.conllu')).not.toContain('jesm');
  });
});

describe('impersonal predicates from Russian', () => {
  /**
   * "Мне холодно" has only a dative experiencer and no subject at all, so the
   * gender fell out of a tie-break as the feminine "zimna". A predicate
   * adjective with no subject is impersonal by definition.
   */
  it('are neuter, and take the copula too', () => {
    /**
     * `jest` because the corpus writes it for impersonals as well: "trěba jest
     * uznati za silnějšego od drugogo", "Nužno jest tuty članok prěvesti",
     * "kde jest trěba iměti vysoku krěpkost".
     */
    expect(out('mne-holodno.conllu')).toBe('Mně jest zimno.');
  });
});

/** Closed-class words where frequency ranking misleads on the Russian side. */
describe('curated Russian function words', () => {
  it('uses the negative existential for "нет"', () => {
    // The interjection `ne` ("no") is far more frequent and was winning,
    // giving the verbless "U mene ne brata".
    expect(out('u-menja-net-brata.conllu')).toBe('U mene nema brata.');
  });

  it('uses the possessive for "его", not an oblique personal form', () => {
    // Was "On vzel nju knigu" - "her", in the accusative. The declinable form
    // is what the pronouns page writes: "Pjotr dal Ivanu jegovu knigu".
    expect(out('vzjal-ego-knigu.conllu')).toBe('On vzel jegovu knigu.');
  });
});

/**
 * Russian fuses the reflexive onto the verb; Interslavic writes it separately,
 * as the syntax page does - "Pica dělaje se".
 */
describe('the reflexive clitic Russian fuses onto the verb', () => {
  it('is written separately, and the lemma is found without it', () => {
    // "читается" is lemmatised `читаться`, which is no dictionary headword, so
    // the word came through untranslated.
    expect(out('kniga-chitaetsja.conllu')).toBe('Kniga čitaje se legko.');
  });

  it('expresses the passive reflexively, keeping the instrumental agent', () => {
    expect(out('dom-stroitsja.conllu')).toBe('Dom stroji se rabotnikami.');
  });

  /**
   * The test is the source FORM's suffix, not `Voice`. Stanza marks
   * `Voice=Mid` on plenty of verbs carrying no clitic - "стала" is one - and
   * keying on it gave "Ona stala se lěkarem".
   */
  it('is not added to a verb that merely carries Voice=Mid', () => {
    expect(out('stala-vrachom.conllu')).toBe('Ona stala lěkarem.');
  });

  it('is not doubled when the chosen lemma already carries it', () => {
    // `bojati sę` already has the clitic: "Ja boju se se psa".
    expect(out('bojus-sobaki.conllu')).toBe('Ja boju se psa.');
  });

  /**
   * A reflexive lemma is often a dictionary headword in its own right, so
   * stripping is a FALLBACK: `нравиться` is `podobati sę`, and stripping first
   * turned it into `нравить`, which found the weaker `prijati`. A trailing
   * clitic also no longer counts as a second word for the single-word
   * preference, which is what had pushed `podobati sę` below it.
   */
  it('prefers a reflexive headword over stripping plus an inserted clitic', () => {
    expect(out('mne-nravitsja.conllu')).toBe('Mně podobaje se ta kniga.');
  });

  /**
   * Stripping is a fallback because the reflexive and the plain verb often mean
   * DIFFERENT things. 217 Russian reflexive glosses resolve to one Interslavic
   * stem whole and a different one stripped - `мучиться` is `agonizovati` ("to
   * suffer") while `мучить` is `mųčiti` ("to torture"), `иметься` is `byti`
   * while `иметь` is `iměti`.
   *
   * This pair is the regression guard: strip-first would turn "He suffers" into
   * "he tortures himself".
   */
  it('does not strip a reflexive into a verb that means something else', () => {
    expect(out('on-muchitsja.conllu')).toBe('On agonizuje.'); // v.intr., glossed "мучиться" itself: no added se
    expect(out('on-muchit-sobaku.conllu')).toBe('On muči psa.');
  });

  /**
   * An indeclinable noun states a case it cannot know. Russian кино, метро,
   * такси, радио, пальто have ONE form for all seven cases, so there is
   * nothing in the word for the parser to read: Stanza tags "идти в кино" as
   * `Case=Loc` when the sense is motion into, i.e. the accusative, and copying
   * that guess gave "idti v kinu" for van Steenbergen's own "idti v kino".
   *
   * Refusing to copy a case the form does not carry lets the cascade reach the
   * preposition's government instead, where a motion verb with a two-case
   * preposition already selects the accusative.
   */
  it('does not copy a case from an indeclinable source noun', () => {
    const text = translate(
      parseConllu(
        fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold/g05-ru.conllu'), 'utf8'),
      ),
      lex,
      { orthography: 'standard' },
    ).text;
    expect(text).toBe('Ja ne hoču idti v kino.');
  });
});

/**
 * Russian "детей" is lemmatised as `ребенок`, which reaches the singular entry
 * `dětę` - not the plural-only `děti` that English "children" now reaches by
 * its form. So the explicit `dětę` case in `takesCollective` is what names the
 * collective here, and only this source exercises it ("četvero dětij",
 * http://steen.free.fr/interslavic/numerals.html).
 */
describe('collective numerals from Russian', () => {
  it('names the collective for children reached through the singular', () => {
    const r = result('ja-vizhu-chetyreh-detej.conllu');
    expect(r.text).toBe('Ja vidžu četyri děti.');
    expect(r.words.find((w) => w.sourceForm === 'детей')?.notes.some((n) => n.includes('"četvero"'))).toBe(true);
  });
});

/**
 * A name the dictionary does not have gets no entry, so no lexical gender -
 * but Russian marks it in the source ("Зульфия" is Gender=Fem), and that is a
 * fact about the referent. The l-participle read it already; the predicate
 * adjective fell through to the masculine default, "Зульфия jest ščestlivy".
 * The name itself is written in Latin by the pages' letter tables: the
 * flavourisation page's East Slavic row gives я = ja, ль = lj ("Zuljfija").
 */
describe('an untranslated subject keeps the gender the source marks', () => {
  it('in the past participle', () => {
    expect(out('zulfija-spala.conllu')).toBe('Zuljfija spala.');
  });

  it('in a predicate adjective', () => {
    expect(out('zulfija-schastliva.conllu')).toBe('Zuljfija jest ščestliva.');
    // and the masculine, which the tie-break would not have given
    expect(out('rustam-schastliv.conllu')).toBe('Rustam jest ščestlivy.');
  });
});
