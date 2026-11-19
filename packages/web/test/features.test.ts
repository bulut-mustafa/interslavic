import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { paradigm } from '../../morph/src/realize.ts';
import { describeFeatures, readable } from '../src/features.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT_DIR, 'packages/lexicon/data/raw/words.tsv'));

describe('feature labels', () => {
  it('has a plain-language label for every feature value the lexicon can produce', () => {
    const unlabelled = new Set<string>();
    for (const e of lex.entries) {
      let tokens;
      try {
        tokens = paradigm(e.lemma, e.pos.xpos, e.addition.principalParts);
      } catch {
        continue;
      }
      for (const t of tokens) {
        for (const [name, value] of Object.entries(t.feats ?? {})) {
          if (readable(name, String(value)) === String(value) && !/^[123]$/.test(String(value))) {
            unlabelled.add(`${name}=${value}`);
          }
        }
      }
    }
    expect([...unlabelled]).toEqual([]);
  });

  it('says Mood=Imp is imperative but Aspect=Imp is imperfective', () => {
    expect(readable('Mood', 'Imp')).toBe('imperative');
    expect(readable('Aspect', 'Imp')).toBe('imperfective');
  });

  it('puts the features in the order a learner looks for them', () => {
    expect(describeFeatures({ Number: 'Sing', Gender: 'Fem', Case: 'Acc' })).toEqual([
      'accusative',
      'feminine',
      'singular',
    ]);
  });

  it('shows a value it has no label for as it came, never as a guess', () => {
    expect(readable('Case', 'Zzz')).toBe('Zzz');
  });
});
