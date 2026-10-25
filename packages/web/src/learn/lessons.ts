import type { LessonPage } from './types.ts';
import introduction from './content/introduction.ts';

/** The lessons in reading order: the sidebar, previous/next and progress follow it. */
export const LESSONS: LessonPage[] = [introduction];

export const SECTIONS: LessonPage['section'][] = ['Start', 'Grammar', 'More'];
