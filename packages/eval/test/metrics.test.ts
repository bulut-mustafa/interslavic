import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  chrfFromStats, chrfStats, corpusChrf, exact, normalise, pairedBootstrap, tyRegister, wordF1,
} from '../scripts/metrics.ts';

/**
 * Expected chrF values were computed with sacrebleu 2.4.3, `CHRF()` defaults
 * (2026-11-22). On the whole Tatoeba sample every sentence's statistics and
 * both corpus scores agreed with it exactly.
 */
const chrf = (hyp: string, refs: string[]) => chrfFromStats(chrfStats(hyp, refs));

describe('chrF matches sacrebleu', () => {
  it('scores single sentences', () => {
    expect(chrf('ja čitaju knigu', ['ja čitaju knigy'])).toBeCloseTo(90.21205646205644, 10);
    // An order the reference is too short for counts no hypothesis n-grams.
    expect(chrf('whoops', ['ups'])).toBeCloseTo(31.425364758698088, 10);
    expect(chrf('dom', ['kniga'])).toBe(0);
  });
  it('takes the best of several references', () => {
    expect(chrf('ona jedaje', ['ona je', 'ona jede'])).toBeCloseTo(77.17998542628128, 10);
  });
  it('sums statistics over the corpus instead of averaging sentence scores', () => {
    const score = corpusChrf([chrfStats('ja čitaju knigu', ['ja čitaju knigy']), chrfStats('ona jedaje', ['ona je'])]);
    expect(score).toBeCloseTo(87.56372434339588, 10);
  });
  it('gives 100 for every reference in the sample scored against itself', () => {
    const pairs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../data/tatoeba/pairs.json'), 'utf8')) as
      Record<string, { refs: string[] }[]>;
    for (const p of Object.values(pairs).flat()) for (const r of p.refs) {
      if (normalise(r)) expect(chrf(r, [r])).toBe(100);
    }
  });
});

describe('normalisation', () => {
  it('reads Cyrillic and etymological spellings as standard Latin', () => {
    expect(normalise('Ја јесм был в горах.')).toBe('ja jesm byl v gorah');
    expect(exact('Hlåpėc davaje děvě knigų.', ['Hlapec davaje děvě knigu'])).toBe(true);
  });
});

describe('word F1 and register', () => {
  it('scores word overlap against the best reference', () => {
    expect(wordF1('ja čitaju knigu', ['ty čitaješ knigu', 'ja čitaju knigu'])).toBe(1);
  });
  it('flags vy where every reference has ty', () => {
    expect(tyRegister('Vy jeste svinja!', ['Ty jesi svinja!'])).toBe(true);
    expect(tyRegister('Vy jeste svinja!', ['Ty jesi svinja!', 'Vy jeste svinja!'])).toBe(false);
  });
});

describe('paired bootstrap', () => {
  it('finds no difference between a run and itself', () => {
    const a = [chrfStats('ja čitaju knigu', ['ja čitaju knigy']), chrfStats('ona jedaje', ['ona je'])];
    expect(pairedBootstrap(a, a, 200)).toEqual({ delta: 0, low: 0, high: 0 });
  });
  it('is repeatable and sees a real gain', () => {
    const before = Array.from({ length: 50 }, () => chrfStats('dom', ['kniga']));
    const after = Array.from({ length: 50 }, () => chrfStats('kniga', ['kniga']));
    const run = pairedBootstrap(before, after, 200);
    expect(run).toEqual(pairedBootstrap(before, after, 200));
    expect(run.low).toBeGreaterThan(0);
  });
});
