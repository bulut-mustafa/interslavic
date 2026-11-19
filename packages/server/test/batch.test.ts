import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate, type Translation } from '../../engine/src/pipeline.ts';
import { BATCH_LIMITS, checkBatch, reasonsFor, translateLines } from '../src/batch.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT_DIR, 'packages/lexicon/data/raw/words.tsv'));
const validator = buildFullFormIndex(lex);
const FIXTURES = path.join(ROOT_DIR, 'packages/engine/test/fixtures/parse');
const fixture = (name: string) => parseConllu(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

describe('checkBatch', () => {
  it('accepts a normal batch', () => {
    expect(checkBatch(['Hello.', 'Bye.'])).toBeNull();
  });
  it('rejects what is not a list of strings', () => {
    expect(checkBatch('Hello')).not.toBeNull();
    expect(checkBatch([1, 2])).not.toBeNull();
    expect(checkBatch(undefined)).not.toBeNull();
  });
  it('enforces each limit', () => {
    expect(checkBatch(Array(BATCH_LIMITS.lines + 1).fill('a'))).toContain('lines');
    expect(checkBatch(['x'.repeat(BATCH_LIMITS.lineChars + 1)])).toContain('characters');
    expect(checkBatch(Array(20).fill('x'.repeat(400)))).toContain('characters');
  });
});

describe('reasonsFor', () => {
  const base: Translation = {
    source: 's', lang: 'en', text: 't', words: [], dropped: [], unknown: [], validationRate: 1, citations: {},
  };
  it('has none for a clean translation', () => {
    expect(reasonsFor(base)).toEqual([]);
  });
  it('names unverified words, guessed features and warnings, using only what the engine said', () => {
    const t: Translation = {
      ...base,
      warnings: ['an idiom'],
      words: [
        { surface: 'abc', lemma: 'abc', sourceForm: 'a', pos: 'n.', notes: [], validation: 'unvalidated', features: [] },
        {
          surface: 'idti', lemma: 'idti', sourceForm: 'go', pos: 'v.', notes: [], validation: 'validated',
          features: [{ name: 'Aspect', value: 'Imp', ruleId: 'r', because: 'b', confidence: 'guess', alternatives: [] }],
        },
      ],
    };
    expect(reasonsFor(t)).toEqual(['not verified in the lexicon: abc', 'guessed aspect of idti', 'an idiom']);
  });
});

describe('translateLines', () => {
  it('returns one result per line, in order, through the real engine', async () => {
    const sentence = fixture('en/water-is-cold.conllu');
    const calls: string[] = [];
    const out = await translateLines(['Water is cold.', '♪ ♪', 'Water is cold.'], {
      parse: async (text) => (calls.push(text), [sentence]),
      translate: (s) => translate(s, lex, { orthography: 'standard', validator }),
    });
    const expected = translate(sentence, lex, { orthography: 'standard', validator });
    expect(out).toHaveLength(3);
    expect(out[0]!.text).toBe(expected.text);
    expect(out[2]!.text).toBe(expected.text);
    expect(out[0]!.flagged).toBe(reasonsFor(expected).length > 0);
  });

  it('does not parse a line with no letters, and returns it unchanged', async () => {
    const calls: string[] = [];
    const out = await translateLines(['♪ ♪', '123'], {
      parse: async (t) => (calls.push(t), []),
      translate: () => { throw new Error('unreachable'); },
    });
    expect(calls).toEqual([]);
    expect(out).toEqual([
      { text: '♪ ♪', flagged: false, reasons: [] },
      { text: '123', flagged: false, reasons: [] },
    ]);
  });

  it('joins the sentences of one line into one translation', async () => {
    const [a, b] = [fixture('en/water-is-cold.conllu'), fixture('en/he-is-a-doctor.conllu')];
    const out = await translateLines(['Water is cold. He is a doctor.'], {
      parse: async () => [a, b],
      translate: (s) => translate(s, lex, { orthography: 'standard', validator }),
    });
    const t = (s: typeof a) => translate(s, lex, { orthography: 'standard', validator }).text;
    expect(out[0]!.text).toBe(`${t(a)} ${t(b)}`);
  });

  it('passes a parser failure up instead of returning a partial answer', async () => {
    await expect(
      translateLines(['Hello.'], { parse: async () => { throw new Error('parser service down'); }, translate: () => { throw new Error('x'); } }),
    ).rejects.toThrow('parser service down');
  });
});
