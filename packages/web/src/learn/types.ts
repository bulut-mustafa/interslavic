/**
 * A lesson is data, rendered by one component (Lesson.tsx). The tests read the
 * same data the reader sees, so every Interslavic word on a page is checked
 * against the dictionary and every table cell against the engine
 * (packages/web/test/lessons.test.ts).
 *
 * Interslavic is written once, in standard Latin; the Cyrillic beside it is
 * generated. Inline text takes a small markup: **bold**, *italic*, `code`,
 * [link](url), and {word} for an Interslavic word (checked, and styled).
 */

/** Feature values as the engine names them, e.g. { Case: 'Gen', Number: 'Plur' }. */
export type Feats = Record<string, string>;

export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'note'; text: string }
  | {
      kind: 'example';
      isv: string;
      en: string;
      /** Show a link that opens the English in the translator. Only where the
       *  translator gives exactly `isv` - a test holds it to that. */
      tryIt?: boolean;
      note?: string;
    }
  | {
      kind: 'table';
      caption?: string;
      head: string[];
      rows: string[][];
      /** Columns holding Interslavic words, to check and to show in Cyrillic. */
      isvColumns?: number[];
    }
  | {
      /** An inflection table the engine can check cell by cell. */
      kind: 'forms';
      caption: string;
      lemma: string;
      /** The dictionary's part-of-speech code, e.g. "f." or "v.tr. ipf.". */
      xpos: string;
      head: string[];
      rows: { label: string; cells: { form: string; feats: Feats }[] }[];
    }
  | {
      kind: 'choice';
      prompt: string;
      options: string[];
      /** The options are English (a question about facts), not Interslavic forms. */
      english?: boolean;
      answer: string;
      why: string;
    }
  | {
      kind: 'fill';
      prompt: string;
      answer: string;
      /** Other spellings that are also right (e.g. etymological). */
      accept?: string[];
      why: string;
    }
  | { kind: 'source'; url: string; title: string; quote?: string };

export interface LessonPage {
  slug: string;
  title: string;
  /** One line under the title, and in the sidebar's tooltip. */
  summary: string;
  section: 'Start' | 'Grammar' | 'More';
  /** Proper names on the page, which are not dictionary words. */
  names?: string[];
  blocks: Block[];
}
