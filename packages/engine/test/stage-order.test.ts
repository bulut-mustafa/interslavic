import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRELUDE, STAGES } from '../src/stages/index.ts';

const pipeline = readFileSync(new URL('../src/pipeline.ts', import.meta.url), 'utf8');

describe('stage order', () => {
  /**
   * The check the refactor exists for. A stage that reads a field no earlier
   * stage has written is reading an empty map, which is how "numeral government
   * ran after agreement" and "`ne` lost behind an early return" both looked:
   * no type error, no test failure, just a quietly wrong sentence.
   */
  it('never reads a field before a stage writes it', () => {
    const available = new Set(PRELUDE);
    const violations: string[] = [];
    for (const stage of STAGES) {
      for (const field of stage.reads) {
        if (!available.has(field)) violations.push(`${stage.name} reads "${field}" too early`);
      }
      for (const field of stage.writes) available.add(field);
    }
    expect(violations).toEqual([]);
  });

  /** A declared stage that the pipeline does not call is documentation rot. */
  it('declares exactly the stages the pipeline calls', () => {
    for (const stage of STAGES.filter((s) => !s.derived)) {
      expect(pipeline, `${stage.name} is declared but not called`).toContain(`${stage.name}(`);
    }
  });

  /** And the pipeline calls them in the declared order. */
  it('calls them in the declared order', () => {
    const called = STAGES.filter((s) => !s.derived);
    const positions = called.map((s) => ({ name: s.name, at: pipeline.indexOf(`${s.name}(`) }));
    const sorted = [...positions].sort((a, b) => a.at - b.at).map((p) => p.name);
    expect(sorted).toEqual(called.map((s) => s.name));
  });

  /** Every field a stage writes is read by some later stage, or it is dead. */
  it('writes nothing no later stage reads', () => {
    const dead: string[] = [];
    STAGES.forEach((stage, i) => {
      const later = STAGES.slice(i + 1);
      for (const field of stage.writes) {
        if (!later.some((s) => s.reads.includes(field))) dead.push(`${stage.name}.${field}`);
      }
    });
    expect(dead).toEqual([]);
  });
});
