import type { LessonPage } from './types.ts';

/** Every lesson example that links to the translator. */
export const tryItExamples = (lessons: LessonPage[]) =>
  lessons.flatMap((l) =>
    l.blocks.flatMap((b) => (b.kind === 'example' && b.tryIt ? [{ slug: l.slug, en: b.en, isv: b.isv }] : [])),
  );

/** The frozen parse of an example, named by its sentence so reordering a lesson keeps it. */
export const tryItFixture = (en: string): string =>
  `packages/engine/test/fixtures/parse/lessons/${en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.conllu`;
