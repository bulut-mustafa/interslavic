/**
 * Scoring for score-tatoeba.ts: chrF, word F1, exact match, and a paired
 * bootstrap. Kept apart from the script so each piece is unit-tested.
 */
import { fromCyrillic, toStandard } from '../../morph/src/orthography.ts';

/**
 * Both sides are compared in the standard Latin orthography: contributors write
 * Cyrillic, etymological and standard spellings, and these map exactly
 * (orthography.ts). Then lowercase, with punctuation removed.
 */
export const normalise = (s: string): string =>
  toStandard(fromCyrillic(s)).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export const words = (s: string): string[] => normalise(s).split(' ').filter(Boolean);

/**
 * chrF as sacrebleu computes it by default (sacrebleu/metrics/chrf.py):
 * character n-grams of order 1-6 with whitespace removed, beta 2, no word
 * n-grams. Popović 2015 (W15-3049) found 6-grams best, Popović 2017
 * (W17-4770) beta 2.
 */
const ORDER = 6;
const BETA = 2;

/** Per order: [hypothesis n-grams, reference n-grams, matches]. */
export type ChrfStats = number[];

function ngrams(text: string, n: number): Map<string, number> {
  const chars = [...text.replace(/\s+/g, '')];
  const out = new Map<string, number>();
  for (let i = 0; i + n <= chars.length; i++) {
    const g = chars.slice(i, i + n).join('');
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function pairStats(hyp: string, ref: string): ChrfStats {
  const stats: number[] = [];
  for (let n = 1; n <= ORDER; n++) {
    const h = ngrams(hyp, n);
    const r = ngrams(ref, n);
    let match = 0;
    for (const [g, c] of h) match += Math.min(c, r.get(g) ?? 0);
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    // sacrebleu: "Don't count hits if no reference exists for that n-gram" -
    // an order the reference is too short for adds nothing to the corpus.
    stats.push(r.size > 0 ? sum(h) : 0, sum(r), match);
  }
  return stats;
}

/**
 * sacrebleu's `_compute_score_from_stats` without eps smoothing: precision and
 * recall are averaged over the orders that have n-grams on both sides, and one
 * F-beta is taken from the two means.
 */
export function chrfFromStats(stats: ChrfStats): number {
  let prec = 0, rec = 0, effective = 0;
  for (let n = 0; n < ORDER; n++) {
    const [hyp, ref, match] = [stats[3 * n]!, stats[3 * n + 1]!, stats[3 * n + 2]!];
    if (hyp > 0 && ref > 0) {
      prec += match / hyp;
      rec += match / ref;
      effective++;
    }
  }
  if (effective === 0) return 0;
  prec /= effective;
  rec /= effective;
  if (prec + rec === 0) return 0;
  const f = BETA ** 2;
  // sacrebleu's own order of operations: near-ties between two references must
  // break the same way, or a different reference's statistics are summed.
  const score = ((1 + f) * prec * rec) / (f * prec + rec);
  return 100 * score;
}

/** The statistics of the reference that scores best (sacrebleu: strictly better wins, first on a tie). */
export function chrfStats(hyp: string, refs: string[]): ChrfStats {
  let best: ChrfStats = new Array(3 * ORDER).fill(0);
  let bestScore = -1;
  for (const ref of refs) {
    const stats = pairStats(normalise(hyp), normalise(ref));
    const score = chrfFromStats(stats);
    if (score > bestScore) {
      bestScore = score;
      best = stats;
    }
  }
  return best;
}

/** Corpus chrF: statistics summed over sentences, then one score (not a mean of sentence scores). */
export function corpusChrf(all: ChrfStats[]): number {
  const sum = new Array(3 * ORDER).fill(0);
  for (const s of all) s.forEach((v, i) => (sum[i] += v));
  return chrfFromStats(sum);
}

/** Word overlap F1 against the best reference. */
export function wordF1(hyp: string, refs: string[]): number {
  const got = words(hyp);
  let best = 0;
  for (const ref of refs) {
    const left = new Map<string, number>();
    const want = words(ref);
    for (const w of want) left.set(w, (left.get(w) ?? 0) + 1);
    let common = 0;
    for (const w of got) {
      const n = left.get(w) ?? 0;
      if (n > 0) { common++; left.set(w, n - 1); }
    }
    if (common > 0) best = Math.max(best, (2 * common) / (got.length + want.length));
  }
  return best;
}

export const exact = (hyp: string, refs: string[]): boolean => refs.some((r) => normalise(r) === normalise(hyp));

/**
 * Every reference says "ty" and we say "vy". The pronouns page makes vy the
 * universal form and ty the one for friends, relatives and children, so this
 * is register, not error, and is counted apart.
 */
const TY = /^(ty|teb[eě]|tob[eě]|toboju|tvoj\p{L}*)$/u;
const VY = /^(vy|vas|vam|vami|vaš\p{L}*)$/u;
export const tyRegister = (hyp: string, refs: string[]): boolean =>
  words(hyp).some((w) => VY.test(w)) && refs.every((r) => words(r).some((w) => TY.test(w)));

/** Deterministic PRNG (mulberry32), so a bootstrap run is repeatable. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paired bootstrap resampling (Koehn 2004, "Statistical significance tests for
 * machine translation evaluation"): draw the same sentences for both systems,
 * recompute each corpus score, and read the difference's 95% interval.
 */
export function pairedBootstrap(a: ChrfStats[], b: ChrfStats[], samples = 1000, seed = 1): { delta: number; low: number; high: number } {
  const next = rng(seed);
  const deltas: number[] = [];
  for (let s = 0; s < samples; s++) {
    const pickA: ChrfStats[] = [], pickB: ChrfStats[] = [];
    for (let i = 0; i < a.length; i++) {
      const k = Math.floor(next() * a.length);
      pickA.push(a[k]!);
      pickB.push(b[k]!);
    }
    deltas.push(corpusChrf(pickB) - corpusChrf(pickA));
  }
  deltas.sort((x, y) => x - y);
  return {
    delta: corpusChrf(b) - corpusChrf(a),
    low: deltas[Math.floor(0.025 * samples)]!,
    high: deltas[Math.floor(0.975 * samples) - 1]!,
  };
}
