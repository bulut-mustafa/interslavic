import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const validator = buildFullFormIndex(lex);
const FIXTURES = path.join(import.meta.dirname, 'fixtures/parse');

/**
 * The full-form lexicon exists because output cannot be checked by a fluent speaker
 * by eye, so the engine has to catch its own invented non-words. These tests
 * are the project's primary objective quality signal.
 */

describe('full-form lexicon', () => {
  it('indexes the whole dictionary', () => {
    expect(validator.size).toBeGreaterThan(250_000);
    expect(validator.generated).toBeGreaterThan(300_000);
    // Only a handful of entries yield no paradigm at all.
    expect(validator.skipped).toBeLessThan(50);
  });

  it('accepts forms the engine actually emits', () => {
    for (const form of ['hlapec', 'davaje', 'děvě', 'knigu', 'jest', 'znala', 'novogo', 'zimna']) {
      expect(validator.has(form), form).toBe(true);
    }
  });

  it('indexes both etymological and folded spellings', () => {
    // The dictionary cites "hlåpėc"; the engine renders "hlapec". Both must
    // validate, or every word with an etymological letter would be flagged.
    expect(validator.has('hlåpėc')).toBe(true);
    expect(validator.has('hlapec')).toBe(true);
  });

  it('REJECTS invented non-words', () => {
    for (const bad of ['zzzxqq', 'knigx', 'blurfl', 'velikyu', 'xyzzy']) {
      expect(validator.has(bad), bad).toBe(false);
    }
  });

  it('would have caught the multiword inflection bug', () => {
    // "velikyu" was produced by inflecting the wrong word of "veliky gråd".
    // The validator rejects it, which is exactly the safety net it is for.
    expect(validator.has('velikyu')).toBe(false);
    expect(validator.has('gradu')).toBe(true);
  });

  it('indexes the citation form of entries that yield no paradigm', () => {
    // Five dictionary entries produce no paradigm at all (all flagged with #).
    // Indexing their citation form is the only way they validate, so the
    // engine does not flag a real dictionary word as invented.
    for (const lemma of ['slědovati', 'tȯptati', 'pomrdati']) {
      expect(validator.has(lemma), lemma).toBe(true);
    }
    // ...including the folded spelling, since output is standard orthography.
    expect(validator.has('toptati')).toBe(true);
  });

  it('indexes multiword lemmas, whose paradigms never contain them', () => {
    // paradigm() inflects only the head word, so for 1,734 entries (9%) the
    // full phrase never appears among the generated forms. Indexing the
    // citation form is the only way such a dictionary entry is findable.
    for (const phrase of ['adaptivny režim', 'veliky gråd']) {
      expect(validator.has(phrase), phrase).toBe(true);
      expect(validator.analyze(phrase).length, phrase).toBeGreaterThan(0);
    }
  });

  it('returns every reading, because syncretism is real', () => {
    // děvě serves more than one case; an analyser must not pretend otherwise.
    expect(validator.analyze('děvě').length).toBeGreaterThan(1);
    expect(validator.analyze('děvě').map((r) => r.lemma)).toContain('děva');
    expect(validator.analyze('zzzxqq')).toEqual([]);
  });
});

describe('validation rate over every fixture', () => {
  const fixtures = fs
    .readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.conllu'));

  it('has fixtures to measure', () => {
    expect(fixtures.length).toBeGreaterThan(15);
  });

  it('validates every emitted word across all fixtures', () => {
    const failures: string[] = [];
    for (const f of fixtures) {
      const sentence = parseConllu(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
      const out = translate(sentence, lex, { orthography: 'standard', validator });
      for (const w of out.words) {
        // Untranslated source words are deliberately passed through and are not
        // expected to be Interslavic.
        if (w.validation === 'unvalidated') failures.push(`${f}: ${w.surface}`);
      }
    }
    // This is the metric that substitutes for a human judge. If it regresses,
    // the engine has started inventing words.
    expect(failures).toEqual([]);
  });

  it('reports a rate rather than a bare boolean', () => {
    const sentence = parseConllu(
      fs.readFileSync(path.join(FIXTURES, 'en/water-is-cold.conllu'), 'utf8'),
    );
    expect(translate(sentence, lex, { validator }).validationRate).toBe(1);
    // Without a validator the engine must NOT claim to have checked anything.
    expect(translate(sentence, lex, {}).validationRate).toBeNull();
  });

  it('flags a word that is not in the lexicon', () => {
    // A stub validator that knows nothing: every word must be flagged, proving
    // the check is actually consulted rather than assumed true.
    const nothing = { size: 0, generated: 0, skipped: 0, has: () => false, analyze: () => [] };
    const sentence = parseConllu(
      fs.readFileSync(path.join(FIXTURES, 'en/water-is-cold.conllu'), 'utf8'),
    );
    const out = translate(sentence, lex, { validator: nothing });
    expect(out.validationRate).toBe(0);
    expect(out.words.every((w) => w.validation === 'unvalidated')).toBe(true);
  });
});
