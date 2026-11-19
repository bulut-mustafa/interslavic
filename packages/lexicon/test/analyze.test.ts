import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Lexicon } from '../src/reader.ts';
import { buildFullFormIndex, editDistance } from '../src/full-forms.ts';
import { analyzeText, type AnalyzedWord } from '../src/analyze.ts';
import { fromCyrillic, toCyrillic, toStandard } from '../../morph/src/orthography.ts';
import { paradigm } from '../../morph/src/realize.ts';

/** Built once at module scope, as multiword.test.ts does: inside a test it exceeds the timeout. */
const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT_DIR, 'packages/lexicon/data/raw/words.tsv'));
const index = buildFullFormIndex(lex);

const words = (text: string): AnalyzedWord[] =>
  analyzeText(text, lex, index).tokens.filter((t): t is AnalyzedWord => t.kind === 'word');
const one = (text: string): AnalyzedWord => words(text)[0]!;

describe('analyzeText', () => {
  it('finds a form, its lemma and its grammatical features in the index', () => {
    const w = one('knigu');
    expect(w.status).toBe('known');
    expect(w.readings[0]).toMatchObject({
      lemma: 'kniga',
      pos: 'f.',
      featSets: [{ Gender: 'Fem', Case: 'Acc', Number: 'Sing' }],
    });
  });

  it('takes meanings from the dictionary entry, not from anywhere else', () => {
    const r = one('knigu').readings[0]!;
    const entry = lex.lookupLemma('kniga').find((e) => e.pos.xpos === 'f.')!;
    expect(r.en).toEqual(entry.glosses.map((g) => g.text));
    expect(r.en).toContain('book');
    expect(r.ru).toEqual(entry.ruGlosses.map((g) => g.text));
  });

  it('keeps every character of the input, so the text can be shown back unchanged', () => {
    const text = 'Žena čitaje knigu, a 3 deti - spet!\n';
    const out = analyzeText(text, lex, index);
    expect(out.tokens.map((t) => t.text).join('')).toBe(text);
    expect(out.words).toBe(6);
  });

  it('reads an etymological spelling as the form the dictionary cites', () => {
    expect(one('hlåpcem').status).toBe('known');
    expect(one('hlapcem').readings[0]).toMatchObject({ lemma: 'hlåpėc' });
    expect(one('hlapcem').readings[0]!.featSets.map((f) => f['Case'])).toEqual(['Ins']);
  });

  it('reads Cyrillic as the same word', () => {
    const cyr = one('книгу');
    expect(cyr.script).toBe('cyrillic');
    expect(cyr.normal).toBe('knigu');
    expect(cyr.status).toBe('known');
    expect(cyr.text).toBe('книгу');
  });

  it('ignores capitals when looking a word up', () => {
    expect(one('Knigu').status).toBe('known');
  });

  it('reports a word that is no form of any dictionary word, with nothing invented for it', () => {
    const w = one('xyzzy');
    expect(w.status).toBe('unknown');
    expect(w.readings).toEqual([]);
    expect(w.totalReadings).toBe(0);
  });

  it('marks a capitalised unfound word as a probable name, not as an error', () => {
    expect(one('Xyzzy').status).toBe('maybe-name');
  });

  it('suggests only real forms, nearest first', () => {
    const w = one('knigaa');
    expect(w.status).toBe('unknown');
    expect(w.suggestions).toContain('kniga');
    for (const s of w.suggestions) expect(index.has(s)).toBe(true);
    expect(w.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('reads e as ě when the word is only found that way, and says so', () => {
    const w = one('žene');
    expect(w.status).toBe('known');
    expect(w.readAs).toContain('ženě');
    expect(w.readings[0]).toMatchObject({ lemma: 'žena' });
  });

  it('keeps every feature set of a form, not just the first', () => {
    // The oracle is the paradigm generator itself, not anyone's memory of the grammar:
    // every cell of žena's paradigm whose form is the one asked about.
    const cell = (f: Record<string, string>) => `${f['Case']}-${f['Number']}`;
    for (const form of ['ženě', 'ženy']) {
      const expected = new Set(
        paradigm('žena', 'f.').filter((t) => toStandard(t.form) === form).map((t) => cell(t.feats ?? {})),
      );
      const shown = new Set(one(form).readings.filter((r) => r.lemma === 'žena').flatMap((r) => r.featSets.map(cell)));
      expect(expected.size).toBeGreaterThan(1);
      expect(shown).toEqual(expected);
    }
  });

  it('does not use the ě reading when the word is already a form as written', () => {
    expect(one('sebe').readAs).toBeUndefined();
  });

  it('flags letters that belong to no Interslavic alphabet, and does not guess at them', () => {
    const w = one('я');
    expect(w.status).not.toBe('known');
    expect(w.foreignLetters).toBe(true);
    expect(w.suggestions).toEqual([]);
  });

  it('ranks a plain word above the multiword phrases that contain its form', () => {
    expect(one('ne').readings[0]!.lemma).toBe('ne');
  });

  it('caps the readings it returns but reports how many there are', () => {
    const w = one('je');
    expect(w.readings.length).toBeLessThanOrEqual(6);
    expect(w.totalReadings).toBeGreaterThanOrEqual(w.readings.length);
  });
});

describe('fromCyrillic', () => {
  it('is the inverse of toCyrillic across the index', () => {
    const bad: string[] = [];
    for (const f of lemmas()) {
      const std = toStandard(f);
      const back = fromCyrillic(toCyrillic(f));
      if (back !== std) bad.push(`${f}: ${toCyrillic(f)} -> ${back} (wanted ${std})`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('keeps letters it does not know', () => {
    expect(fromCyrillic('я')).toBe('я');
  });

  it('maps the digraph letters and capitals', () => {
    expect(fromCyrillic('Љубов')).toBe('Ljubov');
    expect(fromCyrillic('џ')).toBe('џ');
    expect(fromCyrillic('Джунгла')).toBe('Džungla');
  });
});

describe('editDistance', () => {
  it('counts insert, delete, substitute and swap as one edit each', () => {
    expect(editDistance('kniga', 'knigaa', 2)).toBe(1);
    expect(editDistance('kniga', 'knga', 2)).toBe(1);
    expect(editDistance('kniga', 'knigo', 2)).toBe(1);
    expect(editDistance('kniga', 'knigi', 2)).toBe(1);
    expect(editDistance('kniga', 'kinga', 2)).toBe(1);
  });

  it('gives up past the limit', () => {
    expect(editDistance('kniga', 'okno', 1)).toBeGreaterThan(1);
  });
});

/** Every single-word lemma the dictionary cites, in its etymological spelling. */
function* lemmas(): Generator<string> {
  for (const e of lex.entries) if (!e.lemma.includes(' ')) yield e.lemma;
}
