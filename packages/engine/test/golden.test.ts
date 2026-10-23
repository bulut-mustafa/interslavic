import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));

const fixture = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));

describe('golden: "The boy gives the girl a book."', () => {
  const sentence = fixture('boy-gives-girl-book.conllu');

  // Gold established BY HAND from the grammar tables and the dictionary,
  // before the pipeline existed. Never let the pipeline author its own gold.
  it('renders the hand-derived standard form', () => {
    expect(translate(sentence, lex, { orthography: 'standard' }).text).toBe(
      'Hlapec davaje děvě knigu.',
    );
  });

  it('renders every orthography', () => {
    const r = (o: 'etymological' | 'standard' | 'simplified' | 'cyrillic') =>
      translate(sentence, lex, { orthography: o }).text;
    expect(r('etymological')).toBe('Hlåpėc davaje děvě knigų.');
    expect(r('standard')).toBe('Hlapec davaje děvě knigu.');
    expect(r('simplified')).toBe('Hlapec davaje deve knigu.');
    expect(r('cyrillic')).toBe('Хлапец даваје дєвє книгу.');
  });

  it('assigns each case from the dependency relation that caused it', () => {
    const out = translate(sentence, lex);
    const caseOf = (src: string) =>
      out.words.find((w) => w.sourceForm === src)?.features.find((f) => f.name === 'Case');

    expect(caseOf('boy')).toMatchObject({ value: 'Nom', because: expect.stringContaining('nsubj') });
    expect(caseOf('girl')).toMatchObject({ value: 'Dat', because: expect.stringContaining('iobj') });
    expect(caseOf('book')).toMatchObject({ value: 'Acc', because: expect.stringContaining('direct object') });
  });

  it('marks obj->Acc as a default, not a certainty', () => {
    const out = translate(sentence, lex);
    const book = out.words.find((w) => w.sourceForm === 'book');
    const c = book?.features.find((f) => f.name === 'Case');
    // We have no governance frame for this verb, and the gloss must say so.
    expect(c?.confidence).toBe('default');
    expect(c?.alternatives.map((a) => a.value)).toContain('Gen');
  });

  it('drops articles and explains why', () => {
    const out = translate(sentence, lex);
    expect(out.dropped.map((d) => d.form)).toEqual(['The', 'the', 'a']);
    expect(out.dropped[0]?.why).toMatch(/no articles/);
  });

  it('translates every word', () => {
    expect(translate(sentence, lex).unknown).toEqual([]);
  });
});

describe('the perfective-present trap', () => {
  // The highest-frequency candidate for "give" is the PERFECTIVE dati
  // (freq 7606) over the imperfective davati (freq 6395). A perfective present
  // reads as a future in Interslavic, so aspect must filter lexical selection.
  it('picks the imperfective davati despite dati ranking higher by frequency', () => {
    const out = translate(fixture('boy-gives-girl-book.conllu'), lex);
    const verb = out.words.find((w) => w.sourceForm === 'gives');
    expect(verb?.lemma).toBe('davati');
    expect(verb?.aspect?.chosen).toBe('Imp');
    expect(verb?.lexicalChoice?.rejected.join(' ')).toContain('dati');
  });
});
