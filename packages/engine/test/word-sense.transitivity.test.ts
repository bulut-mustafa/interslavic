import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon, rank } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const out = (name: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/en', name), 'utf8')),
    lex,
    { orthography: 'standard' },
  ).text;

/**
 * English "leave" is two different Interslavic verbs, and the dictionary states
 * which is which: `ostavjati` is v.tr. "leave, leave behind, abandon",
 * `odhoditi`/`izježđati` are v.intr. departures. Whether the source has a
 * direct object settles it, and transitivity was parsed but never ranked on -
 * so "We must leave before midnight" came out as "musimo ostavjati", which
 * means "we must abandon".
 */
describe('transitivity as a sense signal', () => {
  it('picks an intransitive verb when there is no object', () => {
    expect(out('leave-before-midnight.conllu')).not.toContain('ostavjati');
  });

  it('picks a transitive verb when there is one', () => {
    expect(out('he-left-his-keys.conllu')).toContain('ostavil');
  });

  it('separates "hurt" transitive from "hurt" intransitive', () => {
    // poraniti (v.tr. "hurt, wound, injure") over zabolěti (v.intr. "ache").
    expect(out('he-hurt-himself.conllu')).toBe('On poranil se.');
  });

  /**
   * The dictionary's `v.intr.` means "takes no ACCUSATIVE object", not "takes
   * no object": `izběgati (+2)` "avoid" is marked intransitive and governs a
   * genitive complement. Penalising it for having one handed the sentence to
   * the reflexive "stråniti sę od" instead.
   */
  it('exempts an intransitive verb that governs a case', () => {
    expect(out('avoid-question.conllu')).toBe('Ja izběgaju pytanja.');
  });

  it('does not penalise a verb whose transitivity is unstated', () => {
    // Only `v.tr.` and `v.intr.` are evidence; `v.refl.` and the 78 entries
    // marked just `v.ipf.`/`v.pf.` say nothing either way.
    const unmarked = lex.entries.filter((e) => e.pos.upos === 'VERB' && !e.pos.transitive && !e.pos.intransitive);
    expect(unmarked.length).toBeGreaterThan(0);
    for (const e of unmarked.slice(0, 20)) {
      const withObj = rank([e], { upos: 'VERB', hasDirectObject: true });
      const without = rank([e], { upos: 'VERB', hasDirectObject: false });
      expect(withObj[0]?.lemma, e.lemma).toBe(without[0]?.lemma);
    }
  });
});
