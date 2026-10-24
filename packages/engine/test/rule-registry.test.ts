import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { ruleRegistry } from '../../rules/src/registry.ts';
import { scanRuleIds } from '../../rules/src/scan-rule-ids.ts';

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

/**
 * Rule ids written in the source, whether or not any fixture reaches them.
 * Collecting only emitted ids missed four rules entirely - and a rule no
 * fixture runs is the one most likely to be wrong, so it is the last one that
 * should escape having to name a source.
 */
const inSource = scanRuleIds([
  path.join(ROOT, 'packages/engine/src'),
  path.join(ROOT, 'packages/rules/src'),
  path.join(ROOT, 'packages/morph/src'),
  path.join(ROOT, 'packages/lexicon/src'),
]);

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
   * Every rule that cites a page or usage quotes the sentence it rests on.
   * This was held at 13 while some rules pointed at a page without a
   * sentence; all 13 were pinned (or, for one that asserts nothing about
   * Interslavic, reclassified structural), so it is now zero and stays zero.
   */
  it('quotes a verbatim sentence for every normative and corpus rule', () => {
    const unquoted = [...ruleRegistry()]
      .filter(([, c]) => (c.tier === 'normative' || c.tier === 'corpus') && !c.quote)
      .map(([id]) => id);
    expect(unquoted).toEqual([]);
  });

  /**
   * And every rule WRITTEN in the source, including those no fixture reaches.
   * This is the check that found `anaphora.one`, `aspect.adverbial.perf`,
   * `aspect.tense.progressive` and `case.phrasalObject` - all written, none
   * exercised, so all four were invisible to the emitted-ids check above.
   */
  it('cites every rule written in the source', () => {
    const registry = ruleRegistry();
    const uncited = [...inSource].filter((id) => !registry.has(id)).sort();
    expect(uncited).toEqual([]);
  });

  /** A registry entry for a rule that exists nowhere is stale documentation. */
  it('keeps no entry for a rule that is not in the engine', () => {
    const live = new Set([...emittedRuleIds().keys(), ...inSource]);
    const stale = [...ruleRegistry().keys()].filter((id) => !live.has(id)).sort();
    expect(stale).toEqual([]);
  });

  /**
   * A rule reachable in the source but emitted by no fixture has nothing
   * checking what it produces. This was held at 4; each now has a fixture (or,
   * for one that was unreachable, was deleted), so it is zero and stays zero.
   */
  it('does not grow the set of rules no fixture exercises', () => {
    const emitted = new Set(emittedRuleIds().keys());
    const unexercised = [...inSource].filter((id) => !emitted.has(id)).sort();
    expect(unexercised).toEqual([]);
  });
});
