import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

/**
 * Defects where the engine lost or misread data it had, found by the
 * 2026-11-22 pipeline audit. No grammar rule is added here: each test pins a
 * place where the code disagreed with itself.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const result = (file: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', file), 'utf8')),
    lex,
    { orthography: 'standard' },
  );

describe('final punctuation', () => {
  it('is found behind a closing quote', () => {
    expect(result('en/he-asked-why-quoted.conllu').text).toMatch(/\?$/);
  });
});

describe('Russian "её" as a possessive', () => {
  // The parser lemmatises it "ее"; the curated entry is keyed "её".
  it('reaches the curated jejin', () => {
    expect(result('ru/ja-znaju-ejo-brata.conllu').text).toBe('Ja znaju jejinogo brata.');
  });
});

describe('a number in digits', () => {
  it('is kept as written and not counted as untranslated', () => {
    const t = result('en/the-train-leaves-at-9-15.conllu');
    const digits = t.words.filter((w) => /^\d/.test(w.surface));
    expect(digits.length).toBeGreaterThan(0);
    for (const w of digits) expect(w.validation).toBe('validated');
    expect(t.unknown.filter((u) => /^\d/.test(u))).toEqual([]);
  });
});
