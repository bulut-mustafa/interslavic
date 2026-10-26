import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  );
const out = (name: string) => result(name).text;

/**
 * English carries a lot of verb meaning in a particle, and the dictionary
 * already glosses the phrases: 1,081 verb+particle glosses exist. Every one was
 * being translated a word at a time, so "wake up" became a verb plus the adverb
 * "vgoru".
 *
 * Only `compound:prt` is used. A true particle is an ADVERB and UD has already
 * decided it is not heading a prepositional phrase, which makes the reading
 * unambiguous - and that is where the mass of the data is (up 205, out 203,
 * away 119, off 106, down 69).
 */
describe('phrasal verbs', () => {
  it('translates the whole phrase as one verb', () => {
    expect(out('i-wake-up-early.conllu')).toBe('Ja budžu se rano.');
    expect(out('the-house-burned-down.conllu')).toBe('Dom dogorěl.'); // "down" finishes it: perfective
  });

  it('drops the particle and says why', () => {
    const r = result('please-give-up.conllu');
    expect(r.text).toContain('odrěkajte se');
    const why = r.dropped.map((d) => d.why).join(' ');
    expect(why).toContain('phrasal verb');
  });

  /**
   * A verb plus a genuine PREPOSITION is excluded on purpose. `podhoditi` is
   * glossed "suit, be suitable, befit, go with" - the "that tie goes with the
   * shirt" sense - and matching bare "go with" turned this sentence into "Ja
   * podhodžu njego", "I suit him". English gives the compositional reading the
   * same shape, and the dictionary cannot distinguish them.
   */
  it('does not treat a verb plus a preposition as a phrasal verb', () => {
    expect(out('i-go-with-him-phrasal.conllu')).toBe('Ja idu s njim.');
  });

  it('leaves an ordinary preposition alone', () => {
    expect(out('i-live-in-a-village.conllu')).toContain('v malom selu');
  });
});
