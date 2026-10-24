import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { isAroundAPlace, isMotionVerb } from '../../rules/src/motion.ts';

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

/**
 * "Perfective aspect focuses on the result of an action [...] the action has
 * been completed"; the imperfective expresses "an ongoing process, a habit or a
 * repeated action". http://steen.free.fr/interslavic/verbs.html
 *
 * A movement that reached a goal has a result. One without a goal, or a
 * habitual one, does not - and those two are what a wider rule got wrong.
 */
describe('the aspect of a past movement', () => {
  it('is perfective when the movement reached a goal', () => {
    expect(out('cat-ran-under-table.conllu')).toBe('Kot poběgl pod stol.');
    expect(out('came-to-the-party.conllu')).toBe('On prišel do zabavy.');
  });

  it('stays imperfective without a goal', () => {
    expect(out('ran-for-an-hour.conllu')).toBe('Ja jesm běgl časinu.');
  });

  it('applies only to verbs of motion', () => {
    // "to" here is the addressee, not a goal: talking has no result.
    expect(out('talked-to-her-mother.conllu')).toContain('razgovarjala');
  });

  it('stays imperfective when the movement was a habit', () => {
    // "every" belongs to "morning", one level below the verb.
    expect(out('ran-every-morning.conllu')).toBe('Ona běgla vsako utro.');
    // And it outranks the direct object, which alone would make it perfective.
    expect(out('read-a-book-every-night.conllu')).toContain('jesm čital knigu');
  });
});

/**
 * "The nominative can always be used instead of the vocative. However, if you
 * prefer to use a real vocative anyway, then the following forms are
 * recommended" - http://steen.free.fr/interslavic/nouns.html
 */
describe('the person addressed', () => {
  it('takes the nominative, and names the vocative as the alternative', () => {
    expect(out('brother-help-me.conllu')).toMatch(/^Brat\b/);
    const c = caseOf('brother-help-me.conllu', 'Brother');
    expect(c).toMatchObject({ value: 'Nom', ruleId: 'case.vocative.nominative', confidence: 'high' });
    expect(c?.alternatives.map((a) => a.value)).toContain('Voc');
  });
});

/**
 * "ja čital jesm knigu (imperfective) means „I was reading a book" or „I have
 * been reading a book", ja pročital jesm knigu (perfective) means „I have read
 * a book (and finished it)"." http://steen.free.fr/interslavic/verbs.html
 */
describe('the English perfect', () => {
  it('is perfective when completed', () => {
    expect(out('have-read-a-book.conllu')).toBe('Ja jesm pročital knigu.');
  });

  it('is perfective after a completive adverb', () => {
    expect(out('suddenly-opened-the-door.conllu')).toBe('On iznenada otvoril dveri.');
  });

  it('is imperfective when progressive', () => {
    expect(out('have-been-reading.conllu')).toBe('Ja jesm čital knigu.');
  });
});

describe('agreement', () => {
  it('is only as certain as the head it copies from', () => {
    const words = translate(read('en', 'i-see-a-bigger-house.conllu'), lex, { orthography: 'standard' }).words;
    const caseOf = (surface: string) =>
      words.find((w) => w.surface === surface)?.features.find((f) => f.name === 'Case');
    // The object's accusative is a default (no government entry for "see"),
    // so the adjective that agrees with it cannot be more certain than that.
    expect(caseOf('dom')?.confidence).toBe('default');
    expect(caseOf('večši')).toMatchObject({ ruleId: 'agreement.fromHead', confidence: 'default' });
  });
});

/** "Igor jezdil po Moskvě „Igor was driving around in Moscow"" - verbs page. */
describe('moving around in a place', () => {
  it("reproduces van Steenbergen's sentence", () => {
    expect(outGold('g21.conllu')).toBe('Igor jezdil po Moskvě');
  });

  /** "<verb lemma> around [in Moscow]" - only the shape matters. */
  const around = (verb: string, place: boolean) =>
    parseConllu(
      [
        '# text = x',
        '# lang = en',
        `1\t${verb}\t${verb}\tVERB\tVBD\tTense=Past|VerbForm=Fin\t0\troot\t_\t_`,
        '2\taround\taround\tADV\tRB\t_\t1\tadvmod\t_\t_',
        ...(place
          ? ['3\tin\tin\tADP\tIN\t_\t4\tcase\t_\t_', '4\tMoscow\tMoscow\tPROPN\tNNP\tNumber=Sing\t1\tobl\t_\t_']
          : []),
        '',
      ].join('\n'),
    );

  it('needs a verb of motion and a place it moves in', () => {
    const adverb = (s: ReturnType<typeof around>) => s.tokens.find((t) => t.id === 2)!;
    expect(isAroundAPlace(adverb(around('drive', true)), around('drive', true))).toBe(true);
    expect(isAroundAPlace(adverb(around('drive', false)), around('drive', false))).toBe(false);
    expect(isAroundAPlace(adverb(around('sleep', true)), around('sleep', true))).toBe(false);
  });
});
