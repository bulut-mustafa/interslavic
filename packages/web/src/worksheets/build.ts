import type { Block, LessonPage } from '../learn/types.ts';
import type { Phrase, PhraseGroup } from '../learn/phrasebook.ts';

/** A phrase the teacher wrote, as opposed to one from the phrasebook: it has no source to point to, and nothing has checked it. */
export interface CustomPhrase {
  isv: string;
  en: string;
  note?: string;
  source: 'custom';
}

/**
 * A worksheet is assembled first: every ready-made question is an exercise or a
 * table that is already in a lesson (where tests check its Interslavic against
 * the dictionary and its forms against the engine), or a phrase from the
 * phrasebook (each from the dictionary or a numbered Tatoeba sentence). Nothing
 * here adds a word of Interslavic, so a worksheet can only be as right as the
 * lessons are. A teacher can then change those questions or write their own
 * (draft.ts); what they change or add is theirs, is marked as such, and has not
 * been checked by anything.
 */

export interface Selection {
  /** Lesson slugs whose fill-in and multiple-choice exercises to include. */
  exercises: string[];
  /** Lesson slugs whose inflection tables to include, with the cells blank. */
  tables: string[];
  /** Phrasebook topics to turn into "translate this" questions. */
  phrases: string[];
}

export type Item =
  | { kind: 'fill'; number: number; prompt: string; answers: string[]; why: string }
  | {
      kind: 'choice';
      number: number;
      prompt: string;
      options: string[];
      answer: string;
      why: string;
    }
  | { kind: 'phrase'; number: number; phrase: Phrase | CustomPhrase }
  | {
      kind: 'table';
      number: number;
      caption: string;
      head: string[];
      rows: { label: string; forms: string[] }[];
    };

export interface Section {
  title: string;
  /** What the student is asked to do. */
  instruction: string;
  items: Item[];
}

type Fill = Extract<Block, { kind: 'fill' }>;
type Choice = Extract<Block, { kind: 'choice' }>;
type Forms = Extract<Block, { kind: 'forms' }>;

const fills = (l: LessonPage): Fill[] => l.blocks.filter((b): b is Fill => b.kind === 'fill');
const choices = (l: LessonPage): Choice[] => l.blocks.filter((b): b is Choice => b.kind === 'choice');
const tablesOf = (l: LessonPage): Forms[] => l.blocks.filter((b): b is Forms => b.kind === 'forms');

/** What a lesson can contribute, for the picker. */
export const contributions = (l: LessonPage) => ({
  exercises: fills(l).length + choices(l).length,
  tables: tablesOf(l).length,
});

/** What a section is called, and what it asks of the student, before a teacher changes it. */
export const SECTION_DEFAULTS: Record<string, { instruction: string }> = {
  Exercises: { instruction: 'Fill in the blank with the right form, or circle the right answer.' },
  Tables: { instruction: 'Write the missing forms.' },
  Phrases: { instruction: 'Write each phrase in Interslavic.' },
};

export function buildWorksheet(sel: Selection, lessons: LessonPage[], phrasebook: PhraseGroup[]): Section[] {
  const sections: Section[] = [];
  let n = 0;

  const exerciseItems: Item[] = [];
  for (const l of lessons.filter((x) => sel.exercises.includes(x.slug))) {
    // In the lesson's own order, so a worksheet follows the page it came from.
    for (const b of l.blocks) {
      if (b.kind === 'fill') {
        exerciseItems.push({ kind: 'fill', number: ++n, prompt: b.prompt, answers: [b.answer, ...(b.accept ?? [])], why: b.why });
      } else if (b.kind === 'choice') {
        exerciseItems.push({ kind: 'choice', number: ++n, prompt: b.prompt, options: b.options, answer: b.answer, why: b.why });
      }
    }
  }
  if (exerciseItems.length > 0) {
    sections.push({
      title: 'Exercises',
      instruction: 'Fill in the blank with the right form, or circle the right answer.',
      items: exerciseItems,
    });
  }

  const tableItems: Item[] = [];
  for (const l of lessons.filter((x) => sel.tables.includes(x.slug))) {
    for (const t of tablesOf(l)) {
      tableItems.push({
        kind: 'table',
        number: ++n,
        caption: t.caption,
        head: t.head,
        rows: t.rows.map((r) => ({ label: r.label, forms: r.cells.map((c) => c.form) })),
      });
    }
  }
  if (tableItems.length > 0) {
    sections.push({
      title: 'Tables',
      instruction: 'Write the missing forms.',
      items: tableItems,
    });
  }

  const phraseItems: Item[] = [];
  for (const g of phrasebook.filter((x) => sel.phrases.includes(x.title))) {
    for (const phrase of g.phrases) phraseItems.push({ kind: 'phrase', number: ++n, phrase });
  }
  if (phraseItems.length > 0) {
    sections.push({
      title: 'Phrases',
      instruction: 'Write each phrase in Interslavic.',
      items: phraseItems,
    });
  }

  return sections;
}

export const countItems = (sections: Section[]): number => sections.reduce((n, s) => n + s.items.length, 0);
