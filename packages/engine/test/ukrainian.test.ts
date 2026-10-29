import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon, normalizeSource } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { UK } from '../src/source/adapters.ts';
import { fixMixedScript } from '../../rules/src/mixed-script.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const out = (name: string) => result(`uk/${name}.conllu`).text;

/**
 * The Ukrainian source side, held to the checks the Russian side has
 * (russian.test.ts). The sentences are attested where possible - Tatoeba,
 * the Ukrainian UDHR, Ohienko's Bible - and every fixture's source is in
 * fixtures/parse/uk/SOURCES.md. Where Tatoeba links a sentence to an
 * Interslavic one, that is the expected output.
 */
describe('the Ukrainian dictionary column', () => {
  it('is read with its own glosses', () => {
    expect(lex.lookup('станція', 'uk').map((e) => e.lemma)).toContain('stancija');
    expect(lex.lookup('дівчинка', 'uk').length).toBeGreaterThan(0);
  });

  /**
   * Its lookup key folds й into и and ї into і, as the Russian one folds й
   * and ё. Measured over the whole column: no two Ukrainian glosses differ
   * only by those letters, so the folding merges nothing.
   */
  it('merges no two words by folding й and ї', () => {
    const forms = new Map<string, Set<string>>();
    for (const e of lex.entries) {
      for (const g of e.sourceGlosses.uk ?? []) {
        const key = normalizeSource(g.text, 'uk');
        const raw = g.text.toLowerCase().replace(/[̀́]/g, '').normalize('NFC');
        if (!forms.has(key)) forms.set(key, new Set());
        forms.get(key)!.add(raw);
      }
    }
    const merged = [...forms.values()].filter((s) => s.size > 1 && [...s].some((f) => /[йї]/.test(f)));
    expect(merged).toEqual([]);
  });

  /**
   * Common words the column lacks are supplemented, each attached to an
   * existing entry with evidence (packages/lexicon/data/source-supplement.json).
   */
  it('finds the supplemented words', () => {
    expect(out('de-vokzal')).toBe('Kde jest stancija?');
    expect(out('vona-chytaje-knyzhku')).toBe('Ona čitaje knigu.');
    expect(out('my-kuzeny')).toBe('My jesmo kuzeni.'); // Tatoeba #6688694 / #12994975
    expect(out('starshyj-za-toma')).toBe('Ja jesm duže starějši od Toma.');
    expect(out('fashysty-zaboronjajut')).toBe('Fašisti zabranjajut knigy.'); // Tatoeba #12980913
  });

  it('reaches "ostati" despite the period inside its own cell', () => {
    // The entry's Ukrainian cell is "залишитися. зостатися"; the verb fell back
    // to `ostaviti` "leave" with a clitic: "On ostavil se doma".
    expect(out('zalyshyvsja-vdoma')).toBe('On ostal doma.');
  });
});

/**
 * "Interslavic has got T-V distinction, i.e. vy is a universal second person
 * pronoun for both numbers, whereas the second person singular ty is used only
 * for addressing friends, relatives and children." (pronouns page). Ukrainian
 * states it, as Russian does.
 */
describe('the second person', () => {
  it('keeps the distinction Ukrainian makes', () => {
    expect(out('ty-chytajesh')).toBe('Ty čitaješ knigu.');
    expect(out('vy-chytajete')).toBe('Vy čitajete knigu.');
    expect(out('ty-budesh-zi-mnoju')).toBe('Ty budeš s mnoju.'); // Tatoeba #12984483
    expect(out('vy-budete-zi-mnoju')).toBe('Vy budete s mnoju.'); // Tatoeba #12984486
  });

  it('is declared by the adapter', () => {
    expect(UK.marksSecondPersonNumber).toBe(true);
  });
});

/**
 * Numerals: "the nominative plural after 2-4 and the genitive plural after 5"
 * (numerals page). Ukrainian, unlike Russian, already writes the nominative
 * plural after 2-4 ("два брати"), and the counted noun takes its numeral's case.
 */
describe('numerals from Ukrainian', () => {
  it('uses the nominative plural after 2-4 and the genitive plural after 5', () => {
    expect(out('dva-braty')).toBe('U mene sut dva brati i jedna sestra.');
    expect(out('try-knyhy')).toBe('Ja vidžu tri knigy.');
    expect(out('pjat-brativ')).toBe('U mene sut pet bratov.');
    expect(result('gold/g27-uk.conllu').text).toBe('Pet domov');
    expect(result('gold/g28-uk.conllu').text).toBe('Dva studenti');
  });

  it('takes the numeral\'s case for the counted noun', () => {
    expect(out('z-trjoma-knyhamy')).toBe('Ja jesm prišel s trěmi knigami.');
    expect(out('chotyrjoh-ditej')).toBe('Ja vidžu četyri děti.');
  });

  it('reads a numeral the parser tagged as a verb', () => {
    // "п'ять" came tagged VERB with "братів" its object: "U mene pet bratov".
    expect(out('pjat-brativ')).toContain('sut pet bratov');
  });

  it('puts the copula before an indefinite quantity', () => {
    // Was "U mene mnogo sut knig".
    expect(out('u-mene-bahato-knyzhok')).toBe('U mene sut mnogo knig.');
  });
});

describe('the copula Ukrainian omits', () => {
  it('is written where Interslavic needs it', () => {
    expect(out('my-studenty')).toBe('My jesmo studenti.'); // Tatoeba #480447
    expect(out('vin-likar')).toBe('On jest doktor.');
    expect(out('de-stancija')).toBe('Kde jest stancija?');
    expect(out('ne-idioty')).toBe('My ne jesmo idioti.'); // Tatoeba #13024965
    expect(out('ja-kit')).toBe('Ja jesm kot.'); // Tatoeba #12980636
  });

  /**
   * The parser treats a verbless clause as an elided predicate (UD `orphan`),
   * promoting the subject to root - so the predicate never got its copula.
   */
  it('is written in a clause the parser marks as an elided predicate', () => {
    expect(out('cej-podarunok')).toBe('Tutoj podarok jest dlja tebe.');
    expect(out('ja-z-tomom')).toBe('Ja jesm s Tomom.'); // Tatoeba #12984491
    expect(out('vona-z-nym')).toBe('Ona jest s njim.'); // Tatoeba #12981697
  });

  it('is not written into a bare phrase', () => {
    expect(out('do-zavtra')).toBe('Do zautra!');
  });
});

/**
 * The future is "budu" + infinitive (verbs page). Ukrainian has the same
 * analytic future, a synthetic one ("читатиму", the same tense: Граматика
 * української мови, 2007) and the perfective present.
 */
describe('the future', () => {
  it('is budu + infinitive in all three Ukrainian forms', () => {
    expect(out('budu-chytaty')).toBe('Ja budu čitati knigu.');
    expect(out('chytatymu')).toBe('Ja budu čitati knigu.');
    expect(out('ne-robytymu')).toBe('Ja ne budu dělati tutogo s toboju.');
    // Reflexive too: "запізнюватимусь" is запізнюватися + -му + -сь.
    expect(out('zapiznjuvatymus')).toBe('Jestli ja budu opozdnjati se, ne čekaj na mene.');
    expect(out('prochytaju-knyhu')).toBe('Ja budu pročitati knigu.');
  });

  it('keeps the future copula', () => {
    expect(out('budu-z-toboju')).toBe('Ja budu s toboju.'); // Tatoeba #13000107
    expect(out('budu-z-vamy')).toBe('Ja budu s vami.'); // Tatoeba #13000110
  });
});

describe('comparison', () => {
  /**
   * Ukrainian marks the standard with "за" + accusative or "від" + genitive
   * (a bare genitive is an error in Ukrainian); Interslavic takes "od" with
   * the genitive.
   */
  it('gives the standard "od" with the genitive', () => {
    expect(out('starshyj-za-mene')).toBe('On jest starějši od mene na dva roky.');
    expect(out('budynok-bilshyj-za')).toBe('Tutoj dom jest večši od togo doma.');
    expect(out('budynok-bilshyj-vid')).toBe('Tutoj dom jest večši od togo doma.');
    expect(out('chytaje-shvydshe')).toBe('Ona čitaje bystrěje od mene.');
  });

  it('keeps "ніж" as než', () => {
    expect(out('bilshyj-nizh')).toBe('Tutoj dom jest večši, než toj.');
    expect(out('krashche-nizh-ja')).toBe('Tom lěpje igraje v šahy, než ja.');
  });

  it('builds the degree from the positive, and never twice', () => {
    // "швидше" is listed only as `raděje` "rather"; from "швидко" it is bystrěje.
    expect(out('chytaje-shvydshe')).toContain('bystrěje');
    // "краще" matched `krasnějši` and was compared again: "krasnějšeje".
    expect(out('krashche-nizh-ja')).toContain('lěpje');
  });

  it('takes a suppletive comparative through its positive', () => {
    // "кращий" is the comparative of "добрий" (Wiktionary); the dictionary
    // lists it first under `krasnějši` "more beautiful". Tatoeba #6859050.
    expect(out('maju-krashchu-ideju')).toBe('Ja imaju lěpšu ideju.');
    // "вищий" is високий's (Wiktionary); adjectives page: "vysoky > vysši".
    // Was "vyšnějši", from `vyšny` "upper". Tatoeba #1598660.
    expect(out('vy-vyshchi-za-mene')).toBe('Vy jeste vysši od mene.');
  });

  it('builds the superlative with naj-', () => {
    expect(out('najkrashchyj-student')).toBe('On jest najlěpši student.');
    expect(out('najbilsh-cikava')).toBe('To jest najinteresnějša kniga.');
    expect(UK.analyticSuperlative).toBe('найбільш');
  });
});

describe('the conditional', () => {
  it('reads "б"/"би" as the conditional', () => {
    expect(out('hotiv-by-chytaty')).toBe('Ja hotěl byh čitati.');
  });

  it('splits "якби" into "if" + the conditional', () => {
    // Wiktionary: "Univerbation of як (“if”) + би (subjunctive particle)".
    expect(out('jakby-ja-znav')).toBe('Ako byh ja znal, ja byh prišel.');
    expect(out('jakby-ja-ce-znav')).toBe('Ako byh ja tuto znal, ja byh tamo ušel.');
  });
});

/**
 * Final clauses: "že or da followed by the conditional" (syntax page), as
 * attested: "Ja byh hotěl, že by on je pisal čestěje" (Tatoeba #13357375).
 */
describe('"щоб" clauses', () => {
  it('take že by with an infinitive', () => {
    expect(out('pryjshov-shchob')).toBe('Ja jesm prišel, že byh ubil jego.');
  });

  it('take da by with a finite verb, with no "jesm"', () => {
    expect(out('hochu-shchob')).toBe('Ja hoču, da bys ty spěval pěsnju.');
    expect(out('babel-7')).toContain('da by ne razuměli oni');
  });
});

describe('the imperative', () => {
  it('keeps the number its ending states', () => {
    // The parser tags "Відчини" plural; -и is the singular (Wiktionary tables).
    expect(out('vidchyny-vikno')).toBe('Otvori okno.');
    expect(out('vidchynit-vikno')).toBe('Otvorite okno.');
    expect(out('zachyny-dveri')).toBe('Zatvori dveri, prosim.');
    expect(out('ne-vidchynjaj-vikno')).toBe('Ne otvarjaj okno.');
  });

  it('has a first person plural', () => {
    // "dělajmo „let's do!”" (verbs page); Gen 11:3, 11:7.
    expect(out('babel-3')).toContain('nadělajmo cegly');
    expect(out('babel-7')).toContain('sojdimo, i zaměšajmo');
  });
});

describe('impersonal predicates', () => {
  it('are neuter, with the copula', () => {
    expect(out('meni-holodno')).toBe('Mně jest hladno.');
    expect(out('bulo-holodno')).toBe('Dnes bylo mnogo hladno.');
  });
});

/**
 * The curated function words, mirroring the Russian entries
 * (packages/rules/data/function-words.json).
 */
describe('curated function words', () => {
  it('builds the reciprocal "один одного" as jedin drugogo', () => {
    // pronouns page: "the formula jedin drugogo"; was "jedin jednomu".
    expect(out('babel-3-intro')).toBe('I skazali oni jedin drugomu');
    expect(result('gold/g51-uk.conllu').text).toContain('jedin do drugogo');
  });

  it('takes the declinable possessive', () => {
    expect(out('vzjav-joho-knyhu')).toBe('On vzel jegovu knigu.');
    expect(out('babel-6')).toContain('jihnogo truda');
  });

  it('gives "немає" as nema, and work one is at as råbota', () => {
    expect(out('nemaje-brata')).toBe('U mene nema brata.');
    expect(out('na-roboti')).toBe('On jest na rabotě.');
  });

  it('reads "повинен" with an infinitive as the modal', () => {
    // Was "vinniki", "the guilty".
    expect(out('povynni-pity')).toContain('jesmo povinni ujdti');
  });
});

describe('reflexive verbs', () => {
  it('keep or add the clitic as the dictionary says', () => {
    expect(out('mijusja')).toBe('Ja myju se.');
    expect(out('knyha-chytajetsja')).toBe('Kniga čitaje se legko.');
    expect(out('meni-podobajetsja')).toBe('Mně podobaje se tuta kniga.');
    expect(out('jij-podobajetsja')).toBe('Jej podobaje se kuhati.');
  });

  it('are not taken as transitive because of a dative object', () => {
    // The parser labels "Мені" `obj`; that handed "подобатися" to `prijati`.
    expect(out('meni-podobajetsja')).not.toContain('prija');
  });
});

/**
 * "The passive voice is created by combining a form of the verb byti „to be”
 * with a passive participle" (verbs page).
 */
describe('the passive', () => {
  it('is built from the participle', () => {
    expect(out('buv-pobudovanyj')).toBe('Dom byl sbudovany.');
    expect(out('izha-bula-pryhotovana')).toBe('Jeda byla prigotovjena mojeju baboju.');
    expect(result('gold/g51-uk.conllu').text).toMatch(/^Oni sut nadani /);
  });

  it('turns the impersonal -но/-то form into the personal passive', () => {
    expect(out('budynok-zbudovano')).toBe('Dom jest sbudovany.');
    expect(out('knyhu-napysano')).toBe('Kniga jest napisana anglijsky.');
    expect(out('mist-zbudovano')).toMatch(/^Most byl sbudovany /);
  });
});

describe('prepositions', () => {
  /**
   * The dictionary's (+N) codes decide between the Interslavic prepositions
   * one Ukrainian preposition glosses: `u` is genitive only ("at the place
   * of"), `v` accusative/locative; `iz` genitive, `s` instrumental.
   */
  it('take the one that governs the source noun\'s case', () => {
    expect(out('vona-v-shkoli')).toBe('Ona jest v školě.');
    expect(out('nemaje-brata')).toMatch(/^U mene /);
    expect(out('budu-z-toboju')).toContain('s toboju');
    expect(out('u-velykomu-misti')).toBe('My živemo v velikom gradu.');
  });

  it('impose their own case where they have one', () => {
    // "про" + accusative is `o` + locative: was "o Evropejsku Uniju".
    expect(out('hovoryv-pro-jes')).toBe('On rěkl o Evropejskoj Uniji.');
  });

  it('give the third-person pronoun its n- form', () => {
    expect(out('vona-z-nym')).toContain('s njim');
    expect(out('babel-6')).toContain('dlja vsih njih');
  });

  it('give the hour as v + the cardinal', () => {
    // "о шостій годині ― at six o'clock" (Wiktionary, after Bilodid's СУМ).
    expect(out('vstaju-o-somij')).toBe('Ja vstavaju v sedm.');
    expect(out('snidaju-o-somij')).toBe('Ja zautrakaju v sedm.');
    expect(out('potjah-vidhodyt')).toContain('v devet');
  });
});

describe('repairs of the Ukrainian parse', () => {
  it('gives the past the gender the verb states, where "ти" has none', () => {
    // verbs page: "jesm byl(a)". Was "Koliko piva ty jesi kupil?".
    expect(out('skilky-pyva-kupyla')).toBe('Koliko piva ty jesi kupila?');
  });

  it('reads a gendered verb as past', () => {
    // Tagged Gender=Masc and Tense=Pres at once: was "Ty umoriš se?".
    expect(out('ty-vtomyvsja')).toBe('Ty jesi umoril se?');
  });

  it('reads "їм" as "I eat" in a verbless sentence with "я"', () => {
    expect(out('ja-jim-jabluko')).toBe('Ja jem jabloko.'); // Tatoeba #13408259
    expect(result('gold/g07-uk.conllu').text).toBe('Ja nikogda ne jem čokoladu.');
  });

  it('reads xcomp:pred as the predicate it is', () => {
    expect(result('gold/g50-uk.conllu').text).toContain('rodet se svobodni i ravni');
  });

  it('does not take a Cyrillic word for a foreign one', () => {
    expect(out('ty-gej')).toBe('Ty jesi gej.'); // Tatoeba #12985202
  });

  it('agrees a verb with the Interslavic number of a plural-only subject', () => {
    expect(out('zbory-vidbulysja')).toBe('Sobranje stignulo včera.');
  });

  it('agrees an interrogative predicate with its subject', () => {
    expect(out('jaka-v-tebe-adresa')).toBe('Koj u tebe jest adres?');
  });
});

describe('language names', () => {
  it('are the masculine adjective, as Interslavic names a language', () => {
    expect(out('vyvchaju-anhlijsku')).toBe('Ja izučaju anglijsky.');
    expect(out('hovorju-francuzkoju')).toContain('francuzsky'); // Tatoeba #12988265
  });
});

describe('names', () => {
  it('are written in Interslavic letters', () => {
    expect(out('rustam-shchaslyvyj')).toBe('Rustam jest ščestlivy.');
    expect(out('zulfija-shchaslyva')).toBe('Zuljfija jest ščestliva.');
  });
});

describe('look-alike Latin letters', () => {
  it('are repaired inside a Cyrillic word and as a lone word', () => {
    // Tatoeba #3130581 and Ohienko's Mt 6:13 as published.
    expect(fixMixedScript('Як вaс звати?', 'uk')).toBe('Як вас звати?');
    expect(fixMixedScript('I не введи нас', 'uk')).toBe('І не введи нас');
  });

  it('leave Latin words alone', () => {
    expect(fixMixedScript('I am here. Model X є', 'uk')).toBe('I am here. Model X є');
  });
});

describe('formulas', () => {
  it('are taken whole', () => {
    expect(out('jak-spravy')).toBe('Kako se imate?');
    expect(out('duzhe-djakuju')).toBe('Velika hvala.');
    expect(out('jak-tebe-zvaty')).toBe('Kak se imenuješ?');
    expect(out('nema-za-shcho')).toBe('Nema za čto.');
    expect(out('dobryj-ranok')).toBe('Dobro utro!');
    expect(out('djakuju')).toBe('Hvala!');
  });
});

/**
 * Ukrainian sentences Tatoeba links to an Interslavic translation, translated
 * exactly as written there.
 */
describe('Tatoeba\'s Ukrainian-Interslavic pairs', () => {
  for (const [name, isv] of [
    ['ja-kishka', 'Ja jesm kotka.'],
    ['de-mama', 'Kde jest mama?'],
    ['tom-mij-plemiannyk', 'Tom jest moj plemenec.'],
    ['ty-ne-durnyj', 'Ty ne jesi glupy.'],
    ['ty-ne-durna', 'Ty ne jesi glupa.'],
    ['zahysnyky-mista', 'Oni sut zaščitniki grada.'],
    ['perezhyv-vijnu', 'Tom prěžil vojnu.'],
    ['zhyvemo-u-riznyh', 'My živemo v raznyh vsemirah.'],
  ] as const) {
    it(name, () => expect(out(name)).toBe(isv));
  }

  it('vijna-ce-myr (the first of its three sentences)', () => {
    // #1422009 / #13026203: "Vojna jest mir. Svoboda jest rabstvo. ..."
    expect(out('vijna-ce-myr')).toBe('Vojna jest mir.');
  });
});
