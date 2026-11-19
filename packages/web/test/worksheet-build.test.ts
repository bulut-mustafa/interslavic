import { describe, expect, it } from 'vitest';
import { buildWorksheet, contributions, countItems, type Selection } from '../src/worksheets/build.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';

const none: Selection = { exercises: [], tables: [], phrases: [] };
const everything: Selection = {
  exercises: LESSONS.map((l) => l.slug),
  tables: LESSONS.map((l) => l.slug),
  phrases: PHRASEBOOK.map((g) => g.title),
};

describe('buildWorksheet', () => {
  it('is empty when nothing is selected', () => {
    expect(buildWorksheet(none, LESSONS, PHRASEBOOK)).toEqual([]);
  });

  it('contains exactly the exercises, tables and phrases of the lessons and phrasebook - no more', () => {
    const total = LESSONS.reduce((n, l) => n + contributions(l).exercises + contributions(l).tables, 0) +
      PHRASEBOOK.reduce((n, g) => n + g.phrases.length, 0);
    expect(countItems(buildWorksheet(everything, LESSONS, PHRASEBOOK))).toBe(total);
    expect(total).toBeGreaterThan(50);
  });

  it('numbers every item once, in order, across the sections', () => {
    const numbers = buildWorksheet(everything, LESSONS, PHRASEBOOK).flatMap((s) => s.items.map((i) => i.number));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('takes answers and reasons from the lesson, unchanged', () => {
    const cases = LESSONS.find((l) => l.slug === 'cases')!;
    const [section] = buildWorksheet({ ...none, exercises: ['cases'] }, LESSONS, PHRASEBOOK);
    const fill = section!.items.find((i) => i.kind === 'fill' && i.prompt.includes('Dajte ___ knigu'))!;
    expect(fill).toMatchObject({ answers: ['ženě'], why: 'The person something is given to is in the dative: {ženě}.' });
    const source = cases.blocks.find((b) => b.kind === 'fill' && b.answer === 'domu');
    expect(source).toBeTruthy();
    const domu = section!.items.find((i) => i.kind === 'fill' && i.answers[0] === 'domu')!;
    expect(domu).toMatchObject({ answers: ['domu', 'domě'] }); // the alternative the grammar allows travels too
  });

  it('keeps every multiple-choice answer among its options', () => {
    for (const s of buildWorksheet(everything, LESSONS, PHRASEBOOK)) {
      for (const i of s.items) if (i.kind === 'choice') expect(i.options).toContain(i.answer);
    }
  });

  it('turns an inflection table into a grid of the same shape, forms kept for the key', () => {
    const lesson = LESSONS.find((l) => contributions(l).tables > 0)!;
    const forms = lesson.blocks.filter((b) => b.kind === 'forms');
    expect(forms.length).toBeGreaterThan(0);
    const [section] = buildWorksheet({ ...none, tables: [lesson.slug] }, LESSONS, PHRASEBOOK);
    expect(section!.items).toHaveLength(forms.length);
    forms.forEach((f, k) => {
      const t = section!.items[k]!;
      if (f.kind !== 'forms' || t.kind !== 'table') throw new Error('shape');
      expect(t.head).toEqual(f.head);
      expect(t.rows.map((r) => r.forms)).toEqual(f.rows.map((r) => r.cells.map((c) => c.form)));
    });
  });

  it('uses the phrases of the chosen topics only, with their sources', () => {
    const topic = PHRASEBOOK[1]!;
    const [section] = buildWorksheet({ ...none, phrases: [topic.title] }, LESSONS, PHRASEBOOK);
    expect(section!.items.map((i) => (i.kind === 'phrase' ? i.phrase : null))).toEqual(topic.phrases);
  });
});
