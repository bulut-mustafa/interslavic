import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { realize } from '../../morph/src/realize.ts';
import { toStandard } from '../../morph/src/orthography.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate } from '../../engine/src/pipeline.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK, PHRASE_NAMES } from '../src/learn/phrasebook.ts';
import { parseInline } from '../src/learn/inline.ts';
import { tryItExamples, tryItFixture } from '../src/learn/try-it.ts';
import type { Block, LessonPage } from '../src/learn/types.ts';

/**
 * The lessons teach, so a wrong form on a page is worse than a wrong form in a
 * translation: a learner copies it. Everything Interslavic a page shows is
 * checked here against the dictionary and the engine - the same data the page
 * renders, not a copy of it.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const index = buildFullFormIndex(lex);

/**
 * Forms the grammar pages state that the generated lexicon does not hold,
 * each with where it is stated. Kept short on purpose: anything else a page
 * shows must be found by the lexicon.
 */
const STATED_BY_THE_GRAMMAR: Record<string, string> = {
  // the conditional of byti: "ja byh dělal(a)", "ty bys dělal(a)", "my byhmo
  // dělali", "vy byste dělali" - http://steen.free.fr/interslavic/verbs.html
  byh: 'verbs.html, conditional',
  bys: 'verbs.html, conditional',
  byhmo: 'verbs.html, conditional',
  byste: 'verbs.html, conditional',
};

const SOURCES = ['http://steen.free.fr/interslavic', 'https://interslavic-dictionary.com', 'https://tatoeba.org'];

/** The Interslavic strings a block shows. */
function isvTexts(block: Block): string[] {
  const inline = (text: string) => parseInline(text).filter((p) => p.kind === 'isv').map((p) => p.text);
  switch (block.kind) {
    case 'p':
    case 'note':
      return inline(block.text);
    case 'example':
      return [block.isv];
    case 'table':
      return block.rows.flatMap((row) => [
        ...row.flatMap(inline),
        ...(block.isvColumns ?? []).map((c) => row[c] ?? ''),
      ]);
    case 'forms':
      return block.rows.flatMap((r) => r.cells.map((c) => c.form));
    case 'choice':
      // The wrong options are meant to be wrong - often a plausible mistake,
      // like "syny" for "syni" - so only the answer must be a real form.
      return [...inline(block.prompt), ...inline(block.why), ...(block.english ? [] : [block.answer])];
    case 'fill':
      // `accept` lists alternatives the grammar allows but the generated
      // lexicon does not hold, such as the locative "domě" beside "domu".
      return [...inline(block.prompt), ...inline(block.why), block.answer];
    default:
      return [];
  }
}

const words = (text: string): string[] =>
  text
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 0);

const unknownWords = (lesson: LessonPage): string[] => {
  const names = new Set((lesson.names ?? []).map((n) => n.toLowerCase()));
  return lesson.blocks
    .flatMap(isvTexts)
    .flatMap(words)
    .filter((w) => !names.has(w.toLowerCase()) && !index.has(w) && !(w.toLowerCase() in STATED_BY_THE_GRAMMAR));
};

describe.each(LESSONS.map((l) => [l.slug, l] as const))('lesson "%s"', (_slug, lesson) => {
  it('shows only real Interslavic forms', () => {
    expect(unknownWords(lesson)).toEqual([]);
  });

  it('builds every inflection table the way the engine does', () => {
    for (const block of lesson.blocks) {
      if (block.kind !== 'forms') continue;
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const lemma = cell.lemma ?? block.lemma;
          const xpos = cell.xpos ?? block.xpos;
          const entry = lex.lookupLemma(lemma).find((e) => e.pos.xpos === xpos);
          expect(entry, `${lemma} (${xpos}) is a dictionary entry`).toBeDefined();
          const made = realize({ lemma, xpos, feats: cell.feats, principalParts: entry!.addition.principalParts });
          expect(made.ok && toStandard(made.form), `${lemma} ${JSON.stringify(cell.feats)}`).toBe(cell.form);
        }
      }
    }
  });

  it('asks only questions it can mark', () => {
    for (const block of lesson.blocks) {
      if (block.kind === 'choice') {
        expect(block.options).toContain(block.answer);
        expect(new Set(block.options).size).toBe(block.options.length);
      }
      if (block.kind === 'fill') expect(block.answer.trim()).toBe(block.answer);
    }
  });

  it('names its sources', () => {
    const sources = lesson.blocks.filter((b) => b.kind === 'source');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(SOURCES.some((allowed) => s.url.startsWith(allowed)), s.url).toBe(true);
    }
  });
});

describe('the lesson list', () => {
  it('has unique addresses', () => {
    const slugs = LESSONS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

/**
 * "Try it" opens the example in the translator. If the translator then says
 * something else, the learner is left choosing between the lesson and the
 * tool - so a link is allowed only where they agree.
 */
describe('"Try it" examples', () => {
  const examples = tryItExamples(LESSONS);
  it.each(examples.map((e) => [e.en, e] as const))('the translator says the lesson\'s "%s"', (_en, e) => {
    const file = path.join(ROOT, tryItFixture(e.en));
    expect(fs.existsSync(file), `no frozen parse - run packages/web/scripts/lesson-fixtures.ts`).toBe(true);
    const out = translate(parseConllu(fs.readFileSync(file, 'utf8')), lex, { orthography: 'standard' }).text;
    expect(out).toBe(e.isv);
  });
});

describe('the phrasebook', () => {
  it('shows only real Interslavic forms', () => {
    const names = new Set(PHRASE_NAMES.map((n) => n.toLowerCase()));
    // A set phrase the dictionary lists as one entry ("Dobrodošli!", "čao!")
    // is found whole; anything else word by word.
    const unknown = PHRASEBOOK.flatMap((g) => g.phrases)
      .filter((p) => !index.has(p.isv) && !index.has(p.isv.replace(/\.$/, '')))
      .flatMap((p) => words(p.isv))
      .filter((w) => !names.has(w.toLowerCase()) && !index.has(w));
    expect(unknown).toEqual([]);
  });

  it('says where every phrase comes from', () => {
    for (const p of PHRASEBOOK.flatMap((g) => g.phrases)) {
      expect(p.source === 'dictionary' || Number.isInteger(p.source), p.isv).toBe(true);
    }
  });
});
