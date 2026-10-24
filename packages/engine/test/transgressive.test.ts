import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { isTransgressive } from '../../rules/src/transgressive.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const g33 = () =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold/g33.conllu'), 'utf8')),
    lex,
    { orthography: 'standard' },
  );

/** A hand-built "<mark> going home, she slept" - only the shape matters here. */
const clause = (mark: string | null, subject = false) => {
  const rows = [
    ...(mark ? [`1\t${mark}\t${mark.toLowerCase()}\tSCONJ\tIN\t_\t2\tmark\t_\t_`] : []),
    `2\tgoing\tgo\tVERB\tVBG\tVerbForm=Part\t5\tadvcl\t_\t_`,
    ...(subject ? [`3\the\the\tPRON\tPRP\t_\t2\tnsubj\t_\t_`] : []),
    `4\tshe\tshe\tPRON\tPRP\t_\t5\tnsubj\t_\t_`,
    `5\tslept\tsleep\tVERB\tVBD\tTense=Past|VerbForm=Fin\t0\troot\t_\t_`,
  ];
  const sentence = parseConllu(['# lang = en', ...rows].join('\n'));
  return isTransgressive(sentence.tokens.find((t) => t.lemma === 'go')!, sentence);
};

/**
 * "The adverbial present active participle (also known as „transgressive")
 * has the same ending, but is not inflected for gender: Iduči do raboty, ona
 * vsegda dymi cigaretoju." http://steen.free.fr/interslavic/verbs.html
 */
describe('the transgressive', () => {
  it("reproduces the page's participle and drops the \"while\" it replaces", () => {
    const out = g33();
    expect(out.text.startsWith('Iduči do ')).toBe(true);
    expect(out.dropped.map((d) => d.form)).toContain('While');
  });

  it('applies to a simultaneous -ing clause with no subject of its own', () => {
    expect(clause('While')).toBe(true);
    expect(clause('When')).toBe(true);
    expect(clause(null)).toBe(true);
  });

  it('leaves a clause that is not simultaneous, or has its own subject, alone', () => {
    expect(clause('After')).toBe(false);
    expect(clause('Before')).toBe(false);
    expect(clause('While', true)).toBe(false);
  });
});
