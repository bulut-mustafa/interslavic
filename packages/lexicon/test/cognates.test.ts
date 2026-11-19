import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildCognateIndex, SLAVIC_COLUMNS } from '../src/cognates.ts';

const TSV = path.resolve(import.meta.dirname, '../../..', 'packages/lexicon/data/raw/words.tsv');
const index = buildCognateIndex(TSV);

/** The dictionary's own cell, read independently of the code under test. */
function cell(isv: string, lang: string): string {
  const lines = fs.readFileSync(TSV, 'utf8').split('\n');
  const h = lines[0]!.split('\t');
  const row = lines.slice(1).map((l) => l.split('\t')).find((f) => f[h.indexOf('isv')] === isv)!;
  return row[h.indexOf(lang)]!;
}

describe('cognate lookup', () => {
  it('finds a word by its Interslavic form, with the dictionary\'s words for every language that has one', () => {
    const [hit] = index.lookup('kniga');
    expect(hit!.isv).toContain('kniga');
    expect(hit!.en).toContain('book');
    for (const l of SLAVIC_COLUMNS) {
      if (hit!.languages[l]) expect(hit!.languages[l]!.words.length).toBeGreaterThan(0);
    }
    expect(hit!.languages.cs!.words.join(', ')).toBe(cell('kniga', 'cs').replace(/^!/, ''));
    expect(hit!.languages.pl!.words.join(', ')).toBe(cell('kniga', 'pl').replace(/^!/, ''));
  });

  it('finds a word by its English meaning, and ranks the exact Interslavic match first', () => {
    const byEnglish = index.lookup('book');
    expect(byEnglish.some((e) => e.isv.includes('kniga'))).toBe(true);
    expect(index.lookup('kniga')[0]!.isv).toContain('kniga');
  });

  it('reads the etymological spelling the dictionary uses from a standard-spelled query', () => {
    expect(index.lookup('hlapec')[0]!.isv).toContain('hlåpėc');
    expect(index.lookup('hlapec')[0]!.languages.cs!.words).toContain('chlapec');
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(index.lookup('  KNIGA ')[0]!.isv).toContain('kniga');
  });

  it('returns nothing for a query too short or unknown', () => {
    expect(index.lookup('a')).toEqual([]);
    expect(index.lookup('qzxwv')).toEqual([]);
  });

  it('caps the number of results', () => {
    expect(index.lookup('do', 3).length).toBeLessThanOrEqual(3);
  });

  it('keeps a language\'s own spelling and script', () => {
    const e = index.lookup('hlapec')[0]!;
    expect(e.languages.ru!.words.join(' ')).toMatch(/\p{Script=Cyrillic}/u);
    expect(e.languages.pl!.words.join(' ')).toMatch(/[a-z]/);
  });

  it('never leaves the dictionary\'s "!" mark inside a word', () => {
    const any = ['voda', 'dom', 'čas', 'denj', 'člověk', 'ljudi', 'rabota', 'novy', 'dobry']
      .flatMap((w) => index.lookup(w))
      .flatMap((e) => Object.values(e.languages));
    for (const c of any) expect(c!.words.every((w) => !w.startsWith('!'))).toBe(true);
  });
});
