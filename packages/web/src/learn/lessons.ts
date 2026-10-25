import type { LessonPage } from './types.ts';
import introduction from './content/introduction.ts';
import alphabet from './content/alphabet.ts';
import pronunciation from './content/pronunciation.ts';
import nouns from './content/nouns.ts';
import cases from './content/cases.ts';

/** The lessons in reading order: the sidebar, previous/next and progress follow it. */
export const LESSONS: LessonPage[] = [introduction, alphabet, pronunciation, nouns, cases];

export const SECTIONS: LessonPage['section'][] = ['Start', 'Grammar', 'More'];
