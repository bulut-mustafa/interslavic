import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (file: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', file), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * Clause structures checked against van Steenbergen's grammar pages
 * (http://steen.free.fr/interslavic/), his own Interslavic texts (Maly princ,
 * the Babel text, the Piron essay, Vȯlk i pės, Schleicher's fable) and the
 * Interslavic Wikipedia (isv.miraheze.org). Each expectation names the line it
 * follows.
 */
describe('conditionals', () => {
  it('"would have done" is byl byh dělal (verbs page)', () => {
    // "ja byl byh dělal 'I would have done' (m.), ja byla byh dělala (f.)"
    expect(out('en/she-would-have-helped.conllu')).toBe('Ona byla by pomogla nam.');
  });

  it('an unreal "if" is ako with the conditional', () => {
    // "Lěpje by bylo, ako bys prihodil v to samo vrěme" (Maly princ).
    expect(out('en/if-i-had-known-would-have.conllu')).toBe(
      'Ako byh ja znal, že vy jeste prihodili, ja byl byh prigotovil večerju.',
    );
    // The conjunctions page lists both ako (li) and jestli as "if"; the split
    // between unreal and real "if" follows his usage:
    // "Ako li lovci by tancevali kogdakoli, vse dni byli by jednakove" (Maly
    // princ, for "if the hunters danced at just any time").
    expect(out('en/if-i-had-money.conllu')).toMatch(/^Ako byh ja iměl /);
  });

  it('a conditional with an object is perfective', () => {
    // "da by uviděl grad i věžu" (Babel), "by odkryl" (Piron); verbs page:
    // perfective "focuses on the result of an action".
    expect(out('en/if-i-had-money.conllu')).toMatch(/, ja byh kupil avto\.$/);
  });

  it('a real "if" keeps jestli', () => {
    // "Jestli eskadron imaje veličinu v rotu, ..." (Interslavic Wikipedia).
    expect(out('en/if-it-rains.conllu')).toMatch(/^Jestli /);
  });
});

describe('reported speech', () => {
  it('always opens with že, and reported "would" is the future', () => {
    // "Jan Hus skazal, že ..."; "grupa rěšila, že ... versija bude ..." (Wikipedia).
    expect(out('en/she-said-she-would-come-back.conllu')).toBe('Ona govorila, že ona bude vračati se.');
    expect(out('en/i-think-he-is-at-home.conllu')).toBe('Myslim, že on jest doma.');
  });

  it('leaves a clause opened by a question word alone', () => {
    expect(out('en/i-know-where-he-lives.conllu')).not.toContain('že');
  });
});

describe('result and purpose clauses', () => {
  it('"so ... that" is a result, with the indicative', () => {
    // "jesm taky glådny, že ne mogų spati" (Vȯlk i pės).
    expect(out('en/so-bad-that-we-stayed.conllu')).toBe('Vrěme bylo tak zlo, že my jesmo ostali doma.');
  });

  it('a modal in a purpose clause takes the conditional, the verb an infinitive', () => {
    // Syntax page: "Final clauses are translated by means of že or da followed
    // by the conditional: … Ona prinosi jabloka, da by děti byli zdrave."
    // "da by pěšehodi mogli hoditi na most" (Wikipedia), "da by mogl uzrěti" (Piron).
    expect(out('en/so-that-we-could-catch.conllu')).toContain('da byhmo my mogli zastati');
  });
});

describe('impersonal clauses are neuter', () => {
  it('in English', () => {
    // "jegove slova ne bylo legko napisati" (Wikipedia).
    expect(out('en/it-was-important-to-read.conllu')).toBe('Bylo važno čitati.');
    expect(out('en/although-it-was-raining.conllu')).toMatch(/^Hot doždilo,/);
  });

  it('in Russian, without borrowing the main clause\'s subject', () => {
    // Was "Hot jesm byl už pozdno": "мы" from the main clause.
    expect(out('ru/hotja-bylo-pozdno.conllu')).toMatch(/^Hot bylo už pozdno, my jesmo /);
  });
});

describe('adverbial participles', () => {
  it('"having done" is -vši on the perfective (verbs page)', () => {
    // "sdělati > sdělavši 'having done'"; "Uslyšavši to, ovca izběgla".
    expect(out('en/having-finished-his-work.conllu')).toMatch(/^Zakončivši svoje dělo, on /);
  });

  it('a Russian converb keeps its form', () => {
    expect(out('ru/prochitav-pismo.conllu')).toMatch(/^Pročitavši /);
    expect(out('ru/chitaja-knigu.conllu')).toMatch(/^Čitajuči knigu, /);
  });
});

describe('relative clauses', () => {
  it('take svoj for the possessor, the antecedent\'s number, and commas', () => {
    // "ljudi, ktori sovsěm ne razumějųt svoje języky" (Piron).
    expect(out('en/students-who-finished-their-exams.conllu')).toBe(
      'Studenti, ktori zakončili svoje izpyty, pošli do jezera.',
    );
  });
});

describe('"city"', () => {
  it('is gråd when the noun has its own adjective', () => {
    // "let us build us a city and a tower" -> "budujmo gråd i věžų" (Babel).
    expect(out('en/live-in-a-big-city.conllu')).toBe('My živemo v velikom gradu.');
  });
});

describe('prepositions of more than one word', () => {
  it('take the dictionary\'s preposition and its case', () => {
    // Dictionary: iz (+2) "from, out of"; poręd (+2) "beside, next to"; po (+3)
    // "according to". The parser marks "out of" and "according to" with
    // ExtPos=ADP, UD's "part of speech that the expression would get".
    expect(out('en/looked-out-of-the-window.conllu')).toBe('Ona gleděla iz okna.');
    expect(out('en/lives-next-to-the-school.conllu')).toBe('Ona žive pored školy.');
    expect(out('en/according-to-the-law.conllu')).toMatch(/^Po pravu, /);
  });
});

describe('"until"', () => {
  it('opening a clause is dopoka ne, with ne before the verb', () => {
    // Conjunctions page: "dopoka ne „till, until”"; his English-Interslavic
    // dictionary: "until ... (conj) dopoka ne". Wikipedia: "dopoka
    // raziskyvanje 2014 roka ne našlo jego".
    expect(out('en/waited-until-he-arrived.conllu')).toBe('My jesmo čekali, dopoka on ne došel.');
  });

  it('before a noun is do with the genitive', () => {
    // His English-Interslavic dictionary: "till ... (prep) do (kogo/čego)".
    expect(out('en/wait-until-friday.conllu')).toBe('Ja budu čekati do petka.');
  });
});

describe('adverbial clauses are set off by commas', () => {
  it('after the main clause, and before it', () => {
    // "ja ju slušal jesm, kogda ona žalila se" (Maly princ); "Ale kogda jest
    // denj, ja nošu verigu" (Vȯlk i pės).
    expect(out('en/reading-when-you-called.conllu')).toContain('čital, kogda ');
    expect(out('en/when-he-came-i-stopped.conllu')).toContain(' i kogda on prišel, ja ');
  });
});

describe('a purpose infinitive', () => {
  it('is že by + conditional, perfective for one bounded act in the past', () => {
    // Syntax page: "Turisti posětili Niderlandiju, že by fotografovali
    // tulipany"; with a bounded object, "da by uviděl grad i věžu" (Babel).
    expect(out('en/went-to-buy-bread.conllu')).toMatch(/, že byhmo kupili hlěb\.$/);
  });

  it('is not used for the complement of an adjective', () => {
    // "jegove slova ne bylo legko napisati" (Wikipedia).
    expect(out('en/nice-to-meet-you.conllu')).not.toContain('že by');
  });
});

describe('tenses', () => {
  it('a future progressive or perfect is budu + infinitive, aspect saying the rest', () => {
    // Verbs page: "The future tense is formed by combining the future tense of
    // the verb byti with the infinitive"; perfective: "will be completed at
    // some point". Was "Ja budu čitaju knigu" / "Ja budu jesm pročital knigu".
    expect(out('en/will-be-reading.conllu')).toBe('Ja budu čitati knigu.');
    expect(out('en/will-have-read.conllu')).toBe('Ja budu pročitati knigu.');
  });

  it('"used to" is the imperfective past', () => {
    // Verbs page: the imperfective expresses "a habit or a repeated action".
    expect(out('en/used-to-read-books.conllu')).toBe('Ja jesm čital knigy.');
  });

  it('a Slavic perfective future becomes budu + infinitive', () => {
    // Verbs page: "Using the present tense of a perfective verb for the future
    // ... is rather to be avoided"; Maly princ: "budu odkryti cěnu ščestja".
    expect(out('ru/ja-prochitaju-knigu.conllu')).toBe('Ja budu pročitati knigu.');
  });
});

describe('verbs of motion', () => {
  it('a habit takes the non-directional verb', () => {
    // Verbs page: "When a non-directional verb of motion has a direction
    // anyway, this expresses a habit: Igor jezdil do Moskvy".
    expect(out('en/used-to-go-to-the-sea.conllu')).toMatch(/ hodili do morja /);
  });

  it('going by transport is jehati / jezditi / pojehati, with the instrumental', () => {
    // Verbs page table: "to go (by transport) jezditi jehati pojehati";
    // dictionary: "jehati želěznicejų „travel by train”".
    expect(out('en/go-to-school-by-bus.conllu')).toBe('Ja vsegda ježdžu do školy avtobusom.');
    expect(out('en/went-to-prague-by-train.conllu')).toMatch(/pojehali do Pragy pojezdom\.$/);
  });
});

describe('"by"', () => {
  it('in a passive is od + genitive; elsewhere the place sense pri', () => {
    // Syntax page: "pica sdělana od studentov"; dictionary: pri (+6) "by, near".
    expect(out('en/book-was-read-by-him.conllu')).toBe('Kniga byla pročitana od njego.');
    expect(out('en/stood-by-the-window.conllu')).toBe('Ona stojala pri oknu.');
  });
});

describe('"differently"', () => {
  it('is inako, also when English says "different"', () => {
    // Dictionary: inako "otherwise, in another way"; Wikipedia: "vsaky avtor
    // piše inače", "za Ukrajincev i Hrvatov inako"; Wiktionary lists the
    // English adverb "different": "Differently." Was "sdělal razny".
    expect(out('en/would-have-done-different.conllu')).toBe('Ja byl byh sdělal inako.');
    expect(out('en/thinks-differently.conllu')).toBe('Ona mysli inako.');
  });
});
