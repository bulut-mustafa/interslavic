import type { LessonPage } from './types.ts';
import introduction from './content/introduction.ts';
import alphabet from './content/alphabet.ts';
import pronunciation from './content/pronunciation.ts';
import nouns from './content/nouns.ts';
import cases from './content/cases.ts';
import adjectives from './content/adjectives.ts';
import pronouns from './content/pronouns.ts';
import verbsPresent from './content/verbs-present.ts';
import verbsTenses from './content/verbs-tenses.ts';
import aspect from './content/aspect.ts';

/** The lessons in reading order: the sidebar, previous/next and progress follow it. */
export const LESSONS: LessonPage[] = [introduction, alphabet, pronunciation, nouns, cases, adjectives, pronouns, verbsPresent, verbsTenses, aspect];

export const SECTIONS: LessonPage['section'][] = ['Start', 'Grammar', 'More'];
