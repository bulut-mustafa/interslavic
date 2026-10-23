import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { CASE_MARKER_PREPOSITIONS } from '../../rules/src/prepositions.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * Three separate defects met in one phrase. "My brother's book is new" was
 * "Moj brat 's kniga jest nova":
 *
 *  - the possessive clitic was emitted as raw English, because the case-marker
 *    path only looked at ADP and Stanza tags `'s` PART;
 *  - the possessor AGREED with the possessed noun instead of taking the
 *    genitive, because `nmod:poss` covers both a pronominal possessive (which
 *    does agree) and a nominal possessor (which does not) - so "the boy's dog"
 *    was "Hlapec pes", a nominative possessor;
 *  - English puts the possessor first and Interslavic puts the genitive after
 *    the noun: "Bog råzměšal język cěloj zemje",
 *    http://steen.free.fr/interslavic/babel_text.html
 */
describe('a nominal possessor', () => {
  it('is a genitive after the noun, with no marker word', () => {
    expect(out('my-brothers-book-is-new.conllu')).toBe('Kniga mojego brata jest nova.');
    expect(out('the-boys-dog-ran-away.conllu')).toBe('Pes hlapca běgl proč.');
  });

  it('is the same thing as an "of"-phrase', () => {
    expect(out('book-of-my-brother.conllu')).toBe('Ja jesm pročital knigu svojego brata.');
  });

  it('registers the clitic as a genitive marker', () => {
    expect(CASE_MARKER_PREPOSITIONS["'s"]).toBe('Gen');
  });
});

/**
 * A PRONOMINAL possessive is a determiner: it agrees and it precedes. Moving
 * or genitivising it would undo work the gold set already covers.
 */
describe('a pronominal possessive still agrees and precedes', () => {
  it('keeps "moja mati" and "svojemu bratu" as they were', () => {
    expect(out('gift-for-my-mother.conllu')).toBe('Tutoj dar jest dlja mojej matere.');
    expect(out('she-gave-her-brother.conllu')).toContain('svojemu bratu');
  });
});
