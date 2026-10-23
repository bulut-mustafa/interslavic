import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Lexicon, normalizeRussian } from '../src/reader.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));

/**
 * The `ru` column marks stress on some entries ("пода́ть") and writes yo where
 * a user will usually type ye ("счёты" for "счеты"). Both are handled by one
 * step: NFD decomposes them to a base letter plus a combining mark, and the
 * combining marks are then stripped.
 *
 * A mutation audit found this uncovered - removing `.normalize('NFD')` broke
 * nothing in the suite - even though it decides whether 6,680 Russian glosses
 * can be looked up at all.
 */
describe('Russian gloss normalisation', () => {
  it('treats yo and ye as the same key', () => {
    expect(normalizeRussian('самолёт')).toBe(normalizeRussian('самолет'));
    expect(normalizeRussian('счёты')).toBe(normalizeRussian('счеты'));
  });

  it('ignores a stress mark the parser will never produce', () => {
    expect(normalizeRussian('пода́ть')).toBe(normalizeRussian('подать'));
  });

  it('finds entries written with yo when the source has none', () => {
    // How a user actually types, and how Stanza lemmatises.
    expect(lex.lookup('самолет', 'ru').map((e) => e.lemma)).toContain('aeroplan');
    expect(lex.lookup('счеты', 'ru').map((e) => e.lemma)).toContain('abak');
  });

  it('is decomposition-insensitive, so either input form matches', () => {
    const composed = 'ёлка'.normalize('NFC');
    const decomposed = 'ёлка'.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    expect(normalizeRussian(composed)).toBe(normalizeRussian(decomposed));
  });
});
