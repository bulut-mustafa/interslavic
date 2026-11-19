import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeFullFormData, fullFormIndexFrom, internReadings } from '../src/full-forms.ts';
import { loadFullFormIndex, readIndexCache, stampFor, writeIndexCache } from '../src/full-forms-cache.ts';
import { Lexicon } from '../src/reader.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const WORDS = path.join(ROOT, 'packages/lexicon/data/raw/words.tsv');
const lex = Lexicon.fromTsv(WORDS);
/** A small, fixed slice of the dictionary (every 150th entry) so these tests take seconds, not the full twelve. */
const small = () => computeFullFormData(lex, { sample: 150 });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ffi-')), 'index.bin');
const answers = (data: ReturnType<typeof small>) => [...data.index.entries()].map(([k, v]) => [k, JSON.stringify(v)]);

describe('saving and loading the index', () => {
  it('gives back exactly what was saved', () => {
    const data = small();
    const file = tmp();
    const stamp = stampFor(ROOT, WORDS);
    writeIndexCache(file, data, stamp);
    const back = readIndexCache(file, stamp)!;
    expect(back.generated).toBe(data.generated);
    expect(back.skipped).toBe(data.skipped);
    expect(back.index.size).toBe(data.index.size);
    expect(answers(back)).toEqual(answers(data));
  });

  it('is not used when the stamp differs, when it is damaged, or when it is not there', () => {
    const file = tmp();
    const stamp = stampFor(ROOT, WORDS);
    writeIndexCache(file, small(), stamp);
    expect(readIndexCache(file, 'f'.repeat(64))).toBeNull(); // made from other sources
    const damaged = fs.readFileSync(file);
    fs.writeFileSync(file, damaged.subarray(0, damaged.length - 1000));
    expect(readIndexCache(file, stamp)).toBeNull(); // cut short
    fs.writeFileSync(file, 'nonsense');
    expect(readIndexCache(file, stamp)).toBeNull();
    expect(readIndexCache(path.join(os.tmpdir(), 'no-such-index.bin'), stamp)).toBeNull();
  });

  it('has a stamp that follows the dictionary and the code, and is steady otherwise', () => {
    const a = stampFor(ROOT, WORDS);
    expect(stampFor(ROOT, WORDS)).toBe(a);
    const other = path.join(path.dirname(tmp()), 'words.tsv');
    fs.writeFileSync(other, 'a different dictionary');
    expect(stampFor(ROOT, other)).not.toBe(a);
  });

  it('falls back to building the index when there is no usable saved one', () => {
    const loaded = loadFullFormIndex(lex, { root: ROOT, wordsPath: WORDS, cacheFile: path.join(os.tmpdir(), 'no-such-index-2.bin') });
    expect(loaded.from).toBe('built');
    expect(loaded.index.has('otec')).toBe(true);
  }, 60000);
});

describe('internReadings', () => {
  it('changes nothing anyone can see', () => {
    const data = small();
    const before = answers(structuredClone(data));
    expect(answers(internReadings(data))).toEqual(before);
    const index = fullFormIndexFrom(data);
    expect(index.has('otec') || index.size > 0).toBe(true);
  });

  it('makes equal feature sets one object, and freezes it so no reading can change another by accident', () => {
    const data = internReadings(structuredClone(small()));
    const sets = new Set<object>();
    let readings = 0;
    for (const bucket of data.index.values()) for (const r of bucket) { sets.add(r.feats); readings++; }
    expect(sets.size).toBeLessThan(readings / 5); // far fewer distinct sets than readings
    const some = [...sets][0] as Record<string, string>;
    expect(Object.isFrozen(some)).toBe(true);
    expect(() => { 'use strict'; (some as Record<string, string>)['Case'] = 'X'; }).toThrow();
  });
});
