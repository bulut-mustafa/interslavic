import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { EXPLETIVE_WEATHER_VERBS } from '../../rules/src/expletives.ts';

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
 * Interslavic has no placeholder subject. The evidence is in
 * packages/rules/src/expletives.ts: impersonal predicates appear with no
 * subject at all in both van Steenbergen's prose and the Interslavic
 * Wikipedia, and every `ono` in that corpus is referential.
 */
describe('an expletive subject is deleted', () => {
  it('drops the weather "it"', () => {
    // Was "Ono doždi".
    expect(out('it-is-raining.conllu')).toBe('Doždi.');
  });

  it('drops the "it" of extraposition and keeps the infinitive', () => {
    // Was "Ono jest važna čitaje": a feminine predicate because there was no
    // subject to agree with, and a conjugated clausal subject.
    expect(out('it-is-important-to-read.conllu')).toBe('Jest važno čitati.');
  });

  it('drops existential "there"', () => {
    expect(out('there-is-a-book.conllu')).toBe('Jest kniga na stolu.');
  });

  it('says why the word is gone', () => {
    const why = result('it-is-raining.conllu').dropped.map((d) => d.why).join(' ');
    expect(why).toContain('placeholder subject');
  });

  it('keeps a REFERENTIAL "it", which is ambiguous in the parse', () => {
    // "It is a good book" and "It is cold" get the same parse - nsubj, 3rd
    // person neuter - so an nsubj "it" is only dropped for a verb that cannot
    // take a real subject. Deleting this one would lose the subject.
    expect(out('it-is-a-good-book.conllu')).toBe('Ono jest dobra kniga.');
  });

  it('lists only verbs that cannot take a referential subject', () => {
    expect(EXPLETIVE_WEATHER_VERBS).toContain('rain');
    expect(EXPLETIVE_WEATHER_VERBS).toContain('snow');
    expect(EXPLETIVE_WEATHER_VERBS).not.toContain('be');
    expect(EXPLETIVE_WEATHER_VERBS).not.toContain('seem');
  });
});
