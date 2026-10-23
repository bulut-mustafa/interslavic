import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { ruleRegistry } from '../../rules/src/registry.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const FIXTURES = path.join(import.meta.dirname, 'fixtures/parse');

/** Every ruleId the engine actually emits, across every frozen fixture. */
function emittedRuleIds(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dir of fs.readdirSync(FIXTURES)) {
    const d = path.join(FIXTURES, dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.conllu'))) {
      let r;
      try {
        r = translate(parseConllu(fs.readFileSync(path.join(d, f), 'utf8')), lex, {
          orthography: 'standard',
        });
      } catch {
        continue;
      }
      for (const w of r.words) {
        for (const feat of w.features) {
          counts.set(feat.ruleId, (counts.get(feat.ruleId) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

describe('rule registry', () => {
  /**
   * The check the registry exists for. A rule with no entry is a rule nobody
   * has had to justify, which for a language tool is the failure that matters:
   * a learner cannot tell an attested form from one we invented.
   */
  it('cites every rule the engine emits', () => {
    const registry = ruleRegistry();
    const uncited = [...emittedRuleIds().keys()].filter((id) => !registry.has(id)).sort();
    expect(uncited).toEqual([]);
  });

  /** A citation that names no source is not a citation. */
  it('gives every non-structural rule a source', () => {
    const bad = [...ruleRegistry()]
      .filter(([, c]) => c.tier !== 'structural' && !c.source)
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  /** Every rule says what it does, so the registry is readable on its own. */
  it('explains every rule', () => {
    const bad = [...ruleRegistry()].filter(([, c]) => !c.why?.trim()).map(([id]) => id);
    expect(bad).toEqual([]);
  });

  /**
   * Some normative rules are expressed by the grammar as a declension table
   * rather than as a sentence, so there is nothing to quote verbatim. That is
   * a real gap, held at its measured size so it can only shrink: pinning one
   * of these to a sentence is an improvement, and adding a new unquoted rule
   * is not.
   */
  it('does not grow the set of rules cited without a verbatim quote', () => {
    const unquoted = [...ruleRegistry()]
      .filter(([, c]) => (c.tier === 'normative' || c.tier === 'corpus') && !c.quote)
      .map(([id]) => id);
    expect(unquoted.length).toBeLessThanOrEqual(12);
  });

  /** A registry entry for a rule nothing emits is stale documentation. */
  it('keeps no entry for a rule the engine never emits', () => {
    const emitted = new Set(emittedRuleIds().keys());
    const stale = [...ruleRegistry().keys()].filter((id) => !emitted.has(id)).sort();
    expect(stale).toEqual([]);
  });
});
