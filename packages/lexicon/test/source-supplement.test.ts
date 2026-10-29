import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../src/reader.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const { words } = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'packages/lexicon/data/source-supplement.json'), 'utf8'),
) as { words: { lang: 'uk'; word: string; isv: string; upos: string; why: string; evidence: string }[] };

/**
 * Source words the dictionary's own columns lack, attached to an existing
 * entry (data/source-supplement.json). Loading fails on a row that matches no
 * entry; this checks the rest - each word finds the entry it names, marked as
 * supplemented, and each row says why and on what evidence.
 */
describe('the source supplement', () => {
  for (const w of words) {
    it(`${w.lang} "${w.word}" finds ${w.isv}`, () => {
      const found = lex.lookup(w.word, w.lang).filter((e) => e.lemma === w.isv && e.pos.upos === w.upos);
      expect(found.length).toBeGreaterThan(0);
      expect(found[0]!.sourceGlosses[w.lang]!.some((g) => g.text === w.word && g.supplemented)).toBe(true);
      expect(w.why.length).toBeGreaterThan(20);
      expect(w.evidence).toMatch(/Wiktionary|dictionary/);
    });
  }

  it('adds no Interslavic word', () => {
    for (const w of words) expect(lex.lookupLemma(w.isv, w.upos).length).toBeGreaterThan(0);
  });
});
