import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { isMotionVerb } from '../../rules/src/motion.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const read = (dir: string, name: string) =>
  parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse', dir, name), 'utf8'));
const out = (name: string) => translate(read('en', name), lex, { orthography: 'standard' }).text;
const outGold = (name: string) => translate(read('gold', name), lex, { orthography: 'standard' }).text;
const caseOf = (name: string, sourceForm: string) =>
  translate(read('en', name), lex, { orthography: 'standard' })
    .words.find((w) => w.sourceForm === sourceForm)
    ?.features.find((f) => f.name === 'Case');

/**
 * "The instrumental is used when the location is stable (Kot spi pod stolom),
 * the accusative expresses a motion toward it (Kot poběgl pod stol)."
 * http://steen.free.fr/interslavic/prepositions.html
 *
 * English writes "under" for both, so the governing verb is the only signal.
 * Without it the planner chose by frequency and gave the sleeping-cat reading
 * for a fleeing cat.
 */
describe('motion versus a stable location', () => {
  it('uses the instrumental for a stable location', () => {
    expect(outGold('g18.conllu')).toBe('Kot spi pod stolom');
    expect(caseOf('cat-sits-under-table.conllu', 'table')).toMatchObject({ value: 'Ins' });
  });

  it('uses the accusative after a verb of motion', () => {
    expect(caseOf('cat-ran-under-table.conllu', 'table')).toMatchObject({ value: 'Acc' });
    expect(outGold('g19.conllu')).toContain('pod stol');
  });

  it('names the verb that made it a motion reading', () => {
    expect(caseOf('cat-ran-under-table.conllu', 'table')?.because).toContain('motion');
  });

  it('leaves prepositions English already distinguishes alone', () => {
    // "in" vs "into" is carried by the government table, not by this rule.
    expect(out('man-works-in-house.conllu')).toBe('Muž rabotaje v domu.');
    expect(out('man-goes-into-house.conllu')).toBe('Muž ide v dom.');
  });

  it('classifies verbs, not Interslavic grammar', () => {
    expect(isMotionVerb('run')).toBe(true);
    expect(isMotionVerb('put')).toBe(true);
    expect(isMotionVerb('sleep')).toBe(false);
    expect(isMotionVerb('work')).toBe(false);
  });
});

/**
 * "When such a form is needed, the optative particle nehaj is used:
 *  Nehaj umre! 'Let him die!' / Nehaj žive dolgo! 'May he live long!'"
 * http://steen.free.fr/interslavic/verbs.html
 */
describe('the optative', () => {
  it('reproduces the page\'s own sentence', () => {
    expect(outGold('g20.conllu')).toBe('Nehaj žive dolgo!');
  });

  it('handles "let him" the same way', () => {
    expect(out('let-him-go.conllu')).toBe('Nehaj ide.');
  });

  it('agrees in number with the person wished for', () => {
    expect(out('may-they-live.conllu')).toBe('Nehaj živut dolgo.');
  });

  it('leaves the ordinary modal reading alone', () => {
    // "He may live long" is permission/possibility, not a wish. The optative is
    // marked by the auxiliary PRECEDING the subject.
    expect(out('he-may-live-long.conllu')).toBe('On može žiti dolgo.');
  });
});
