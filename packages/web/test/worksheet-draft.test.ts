import { describe, expect, it } from 'vitest';
import { buildWorksheet, type Section } from '../src/worksheets/build.ts';
import { addCustom, addSection, applyDraft, countSheet, emptyDraft, hasChanges, loadSaved, moveItem, patchCustom, removeItem, removeSection, resetItem, save, setPatch, setSectionText } from '../src/worksheets/draft.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';

const alphabet = LESSONS.find((l) => l.slug === 'alphabet')!;
const built: Section[] = buildWorksheet({ exercises: ['alphabet'], tables: [], phrases: [PHRASEBOOK[0]!.title] }, LESSONS, PHRASEBOOK);
const exercises = () => applyDraft(built, emptyDraft()).find((s) => s.key === 'Exercises')!;
const school = () => exercises().items.find((i) => i.kind === 'fill' && i.prompt.includes('школа'))!;

describe('with no changes', () => {
  it('is the built worksheet, numbered the same, with nothing marked as changed', () => {
    const sheet = applyDraft(built, emptyDraft());
    expect(sheet.map((s) => [s.key, s.items.length])).toEqual(built.map((s) => [s.title, s.items.length]));
    expect(sheet.flatMap((s) => s.items).map((i) => i.number)).toEqual(built.flatMap((s) => s.items).map((i) => i.number));
    expect(sheet.flatMap((s) => s.items).some((i) => i.edited || i.custom)).toBe(false);
    expect(hasChanges(emptyDraft())).toBe(false);
  });
});

describe('changing a ready-made question', () => {
  it('changes its words and its answer, and marks it as changed', () => {
    const q = school();
    const d = setPatch(emptyDraft(), q.id, { prompt: 'Write in Latin letters: **ljubov**', answers: ['любов', 'ljubov'] });
    const changed = applyDraft(built, d).find((s) => s.key === 'Exercises')!.items.find((i) => i.id === q.id)!;
    expect(changed).toMatchObject({ kind: 'fill', prompt: 'Write in Latin letters: **ljubov**', answers: ['любов', 'ljubov'], edited: true });
    expect(hasChanges(d)).toBe(true);
  });

  it('can be put back as it was', () => {
    const q = school();
    const d = resetItem(setPatch(emptyDraft(), q.id, { prompt: 'x' }), q.id);
    expect(applyDraft(built, d).find((s) => s.key === 'Exercises')!.items.find((i) => i.id === q.id)).toMatchObject({ prompt: q.kind === 'fill' ? q.prompt : '', edited: false });
  });

  it('changes a multiple-choice question\'s choices and which one is right', () => {
    const choice = exercises().items.find((i) => i.kind === 'choice')!;
    const d = setPatch(emptyDraft(), choice.id, { options: ['One', 'Two'], answer: 'Two' });
    const got = applyDraft(built, d).find((s) => s.key === 'Exercises')!.items.find((i) => i.id === choice.id)!;
    expect(got).toMatchObject({ kind: 'choice', options: ['One', 'Two'], answer: 'Two' });
  });

  it('changes a phrase to translate, and its answer', () => {
    const phrase = applyDraft(built, emptyDraft()).find((s) => s.key === 'Phrases')!.items[0]!;
    const got = applyDraft(built, setPatch(emptyDraft(), phrase.id, { en: 'Good night!', isv: 'Dobru noč!' })).find((s) => s.key === 'Phrases')!.items[0]!;
    expect(got.kind === 'phrase' && [got.phrase.en, got.phrase.isv]).toEqual(['Good night!', 'Dobru noč!']);
  });

  it('survives choosing other topics, because it is kept apart from them', () => {
    const q = school();
    const d = setPatch(emptyDraft(), q.id, { prompt: 'mine' });
    const other = buildWorksheet({ exercises: ['alphabet', 'cases'], tables: [], phrases: [] }, LESSONS, PHRASEBOOK);
    const sheet = applyDraft(other, d);
    expect(sheet[0]!.items.find((i) => i.id === q.id)).toMatchObject({ prompt: 'mine', edited: true });
    expect(sheet[0]!.items.length).toBeGreaterThan(exercises().items.length); // and the new topic's questions came in beside it
  });
});

describe('taking questions out', () => {
  it('removes a ready-made one and renumbers the rest', () => {
    const before = exercises().items;
    const gone = before[0]!;
    const after = applyDraft(built, removeItem(emptyDraft(), gone.id)).find((s) => s.key === 'Exercises')!.items;
    expect(after).toHaveLength(before.length - 1);
    expect(after.map((i) => i.number)).toEqual(after.map((_, k) => k + 1));
  });

  it('removes one that was written by hand without leaving a trace of it', () => {
    const { draft, id } = addCustom(emptyDraft(), 'Exercises', 'question');
    expect(removeItem(draft, id)).toEqual(emptyDraft());
  });
});

describe('questions written by hand', () => {
  it('adds a question with an answer, a multiple-choice question and a phrase to translate, at the end of the section', () => {
    let d = emptyDraft();
    const a = addCustom(d, 'Exercises', 'question');
    d = patchCustom(a.draft, a.id, { prompt: 'Write in Latin letters: **школа**', answers: ['škola'] });
    const b = addCustom(d, 'Exercises', 'choice');
    d = patchCustom(b.draft, b.id, { prompt: 'Which is a noun?', options: ['dom', 'bystro'], answer: 'dom' });
    const c = addCustom(d, 'Phrases', 'translate');
    d = patchCustom(c.draft, c.id, { en: 'Thank you', isv: 'Hvala' });
    const sheet = applyDraft(built, d);
    const ex = sheet.find((s) => s.key === 'Exercises')!.items;
    expect(ex.at(-2)).toMatchObject({ kind: 'fill', prompt: 'Write in Latin letters: **школа**', answers: ['škola'], custom: true });
    expect(ex.at(-1)).toMatchObject({ kind: 'choice', answer: 'dom', custom: true });
    const phrases = sheet.find((s) => s.key === 'Phrases')!.items;
    expect(phrases.at(-1)).toMatchObject({ kind: 'phrase', custom: true, phrase: { en: 'Thank you', isv: 'Hvala', source: 'custom' } });
    expect(sheet.flatMap((s) => s.items).map((i) => i.number)).toEqual(sheet.flatMap((s) => s.items).map((_, k) => k + 1));
  });

  it('keeps a hand-written question in its section even when no ready-made one of that kind is chosen', () => {
    const none = buildWorksheet({ exercises: [], tables: [], phrases: [] }, LESSONS, PHRASEBOOK);
    const { draft } = addCustom(emptyDraft(), 'Exercises', 'question');
    const sheet = applyDraft(none, draft);
    expect(sheet.map((s) => s.key)).toEqual(['Exercises']);
    expect(sheet[0]!.instruction).toContain('Fill in the blank'); // with the usual instruction
    expect(countSheet(sheet)).toBe(1);
  });

  it('gives each one its own id', () => {
    const a = addCustom(emptyDraft(), 'Exercises', 'question');
    const b = addCustom(a.draft, 'Exercises', 'question');
    expect(a.id).not.toBe(b.id);
  });
});

describe('sections', () => {
  it('renames a ready-made section and changes its instruction', () => {
    const sheet = applyDraft(built, setSectionText(emptyDraft(), 'Exercises', { title: 'Warm-up', instruction: 'Write the Latin spelling.' }));
    expect(sheet[0]).toMatchObject({ key: 'Exercises', title: 'Warm-up', instruction: 'Write the Latin spelling.' });
  });

  it('adds a section of one\'s own, with questions in it, and can remove it', () => {
    let { draft, id } = addSection(emptyDraft());
    draft = setSectionText(draft, id, { title: 'Reading', instruction: 'Answer in full sentences.' });
    const q = addCustom(draft, id, 'question');
    const sheet = applyDraft(built, q.draft);
    expect(sheet.at(-1)).toMatchObject({ key: id, title: 'Reading', instruction: 'Answer in full sentences.', custom: true });
    expect(sheet.at(-1)!.items).toHaveLength(1);
    expect(applyDraft(built, removeSection(q.draft, id)).some((s) => s.key === id)).toBe(false);
  });

  it('shows an empty section of one\'s own, so there is somewhere to add the first question', () => {
    const { draft, id } = addSection(emptyDraft());
    expect(applyDraft(built, draft).some((s) => s.key === id)).toBe(true);
  });
});

describe('order', () => {
  it('moves a question earlier or later, and renumbers', () => {
    const ids = exercises().items.map((i) => i.id);
    const d = moveItem(emptyDraft(), 'Exercises', ids, ids[1]!, -1);
    const now = applyDraft(built, d).find((s) => s.key === 'Exercises')!.items.map((i) => i.id);
    expect(now.slice(0, 2)).toEqual([ids[1], ids[0]]);
    expect(now.slice(2)).toEqual(ids.slice(2));
  });
  it('does nothing at either end', () => {
    const ids = exercises().items.map((i) => i.id);
    expect(moveItem(emptyDraft(), 'Exercises', ids, ids[0]!, -1)).toEqual(emptyDraft());
    expect(moveItem(emptyDraft(), 'Exercises', ids, ids.at(-1)!, 1)).toEqual(emptyDraft());
  });
});

describe('keeping the worksheet', () => {
  const store = () => {
    const rows = new Map<string, string>();
    return { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => void rows.set(k, v) };
  };
  it('gives back what was saved', () => {
    const s = store();
    const { draft, id } = addCustom(emptyDraft(), 'Exercises', 'question');
    const saved = { draft: patchCustom(draft, id, { prompt: 'mine' }), title: 'My sheet', key: false, selection: { exercises: ['alphabet'], tables: [], phrases: [] } };
    save(saved, s);
    expect(loadSaved(s)).toEqual(saved);
  });
  it('starts afresh from nothing, or from something unreadable', () => {
    expect(loadSaved(store())).toBeNull();
    const s = store();
    s.setItem('interslavic-worksheet-v1', '{not json');
    expect(loadSaved(s)).toBeNull();
    s.setItem('interslavic-worksheet-v1', JSON.stringify({ title: 3 }));
    expect(loadSaved(s)).toBeNull();
  });
  it('does not mind a store that refuses', () => {
    expect(() => save({ draft: emptyDraft(), title: 't', key: true, selection: { exercises: [], tables: [], phrases: [] } }, { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});

describe('the alphabet lesson has the question the teachers asked about', () => {
  it('is a fill-in question about школа, so there is something to change', () => {
    expect(alphabet.blocks.some((b) => b.kind === 'fill' && b.prompt.includes('школа'))).toBe(true);
  });
});
