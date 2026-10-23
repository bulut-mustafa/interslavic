import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const en = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));
const out = (name: string) => translate(en(name), lex, { orthography: 'standard' });
const feat = (name: string, sourceForm: string, featureName: string) =>
  out(name)
    .words.find((w) => w.sourceForm === sourceForm)
    ?.features.find((f) => f.name === featureName);

/**
 * A plurale tantum noun is plural whatever the source says. English "one door"
 * is grammatically singular, but `dveri` has no singular, and the numerals page
 * states what the numeral then does:
 *
 *   "In some cases, [jedin] can also be used in the plural: Jedni ljudi
 *    prědpočitajut lěto, drugi zimu. This is also the case for pluralia
 *    tantum: jedne dveri 'one door'."
 *
 * Source: http://steen.free.fr/interslavic/numerals.html
 *
 * Fixing the noun (see the plurale tantum entry in docs/verification-log.md)
 * left the numeral behind: the noun inflected, the modifier still agreed with
 * the source's singular and gave "Jedna dveri".
 */
describe('plurale tantum nouns are plural, whatever the source says', () => {
  it('declares the noun plural, not singular', () => {
    expect(feat('i-see-one-door.conllu', 'door', 'Number')).toMatchObject({ value: 'Plur' });
  });

  it('cites the dictionary class rather than asserting it', () => {
    expect(feat('i-see-one-door.conllu', 'door', 'Number')?.because).toMatch(/plural/i);
  });

  it('makes the numeral agree in the plural', () => {
    // "jedne dveri", the page's own example - not "jedna dveri".
    expect(out('i-see-one-door.conllu').text.toLowerCase()).toContain('jedne dveri');
  });

  it('leaves an ordinary noun on the number the source gives', () => {
    // Control: the relaxation must not make every noun plural.
    expect(feat('i-see-two-houses.conllu', 'houses', 'Number')).toMatchObject({ value: 'Plur' });
    expect(feat('woman-read-book.conllu', 'book', 'Number')).toMatchObject({ value: 'Sing' });
  });
});
