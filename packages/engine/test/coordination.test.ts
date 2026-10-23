import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { resolveCase } from '../src/resolvers/case.ts';
import type { ParsedSentence, UdToken } from '../../types/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const en = (name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8'));
const out = (name: string) => translate(en(name), lex, { orthography: 'standard' });
const caseOf = (name: string, sourceForm: string) =>
  out(name).words.find((w) => w.sourceForm === sourceForm)?.features.find((f) => f.name === 'Case');

/**
 * `conj` was not in the case cascade, so every coordinated noun fell through to
 * the nominative fallback - a plainly wrong form in an entirely ordinary
 * sentence, and one a Slavic reader spots immediately:
 *   "I see a dog and a cat."  ->  Ja vidžu psa i kot
 *
 * A conjunct is not a new Interslavic rule: it shares its head's grammatical
 * role, so it re-uses the head's decision and the head's confidence.
 */
describe('coordination', () => {
  it('gives a coordinated object the same case as the first object', () => {
    expect(out('see-dog-and-cat.conllu').text).toBe('Ja vidžu psa i kota.');
  });

  it('inherits the head case with the head confidence, not a fresh guess', () => {
    const dog = caseOf('see-dog-and-cat.conllu', 'dog');
    const cat = caseOf('see-dog-and-cat.conllu', 'cat');
    expect(dog).toMatchObject({ value: 'Acc', confidence: 'default' });
    // Same case, same confidence - the conjunct must not claim more or less
    // certainty than the decision it is copying.
    expect(cat).toMatchObject({ value: 'Acc', confidence: 'default' });
    expect(cat?.because).toContain('coordinated with');
  });

  it('carries a preposition\'s government across the whole coordination', () => {
    // The preposition is emitted once, but it governs both nouns.
    expect(out('works-in-house-and-garden.conllu').text).toBe('On rabotaje v domu i sadu.');
    expect(caseOf('works-in-house-and-garden.conllu', 'garden')).toMatchObject({ value: 'Loc' });
  });

  it('carries verb government across the coordination too', () => {
    expect(out('help-brother-and-sister.conllu').text).toBe(
      'Ja pomagaju svojemu bratu i svojej sestrě.',
    );
    expect(caseOf('help-brother-and-sister.conllu', 'sister')).toMatchObject({ value: 'Dat' });
  });

  it('does not loop on a cyclic conj chain', () => {
    // A malformed tree must terminate rather than hang the translator.
    const sentence: ParsedSentence = {
      text: '',
      lang: 'en',
      tokens: [
        { id: 1, form: 'a', lemma: 'a', upos: 'NOUN', feats: {}, head: 2, deprel: 'conj' },
        { id: 2, form: 'b', lemma: 'b', upos: 'NOUN', feats: {}, head: 1, deprel: 'conj' },
      ] as UdToken[],
    };
    const d = resolveCase({ token: sentence.tokens[0]!, sentence });
    expect(d.value).toBe('Nom');
    expect(d.confidence).toBe('guess');
  });
});
