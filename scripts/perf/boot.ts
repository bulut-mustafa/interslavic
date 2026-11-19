/**
 * How long the server takes to get ready, and how much memory it holds once it
 * is: the dictionary, then the full-form index. Run it with GC exposed so the
 * memory figures are not padded by garbage:
 *
 *   npm run perf:boot
 */
import path from 'node:path';
import { Lexicon } from '../../packages/lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../packages/lexicon/src/full-forms.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const mb = (n: number) => Math.round(n / 1048576);
const memory = (label: string) => {
  global.gc?.();
  const m = process.memoryUsage();
  console.log(`  ${label.padEnd(24)} rss ${String(mb(m.rss)).padStart(4)} MB   heap ${String(mb(m.heapUsed)).padStart(4)} MB`);
};
const time = <T>(label: string, work: () => T): T => {
  const t = performance.now();
  const out = work();
  console.log(`  ${label.padEnd(24)} ${String(Math.round(performance.now() - t)).padStart(6)} ms`);
  return out;
};

console.log('server boot');
memory('process start');
const lex = time('dictionary', () => Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv')));
memory('after dictionary');
const idx = time('full-form index', () => buildFullFormIndex(lex));
memory('after full-form index');
console.log(`  (${lex.entries.length} entries, ${idx.size} distinct forms, ${idx.generated} generated)`);
time('120,000 has() lookups', () => {
  let n = 0;
  for (const w of ['otec', 'kniga', 'ženě', 'dobry', 'vsaky', 'xyz']) for (let i = 0; i < 20000; i++) if (idx.has(w)) n++;
  return n;
});
