// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { WorksheetEditor } from '../src/phone/worksheets-edit.tsx';
import { applyDraft, addCustom, countSheet, emptyDraft, moveItem, removeItem, restoreItem, snapshotItem, duplicateItem, type Draft } from '../src/worksheets/draft.ts';
import { buildWorksheet } from '../src/worksheets/build.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';
import { screen } from './live-screen.ts';

const casesLesson = LESSONS.find((l) => l.slug === 'cases')!;
const tableLesson = LESSONS.find((l) => l.blocks.some((b) => b.kind === 'forms'))!;
let latest: Draft = emptyDraft();

function Harness({ start, sel }: { start?: Draft; sel?: { exercises: string[]; tables: string[]; phrases: string[] } }) {
  const [draft, setDraft] = useState<Draft>(start ?? emptyDraft());
  const [title, setTitle] = useState('Sheet');
  const [key, setKey] = useState(true);
  latest = draft;
  const built = useMemo(() => buildWorksheet(sel ?? { exercises: [], tables: [], phrases: [] }, LESSONS, PHRASEBOOK), [sel]);
  const sheet = useMemo(() => applyDraft(built, draft), [built, draft]);
  return <WorksheetEditor sheet={sheet} draft={draft} setDraft={setDraft} title={title} onTitle={setTitle} keyOn={key} onKey={setKey} count={countSheet(sheet)} />;
}

const withCustom = (...kinds: ('question' | 'choice' | 'translate')[]): Draft => kinds.reduce((d, k) => addCustom(d, 'Exercises', k).draft, emptyDraft());
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('the phone worksheet editor', () => {
  it('shows each kind of question as a card with its own fields and a plain type label', () => {
    render(<Harness start={withCustom('question', 'choice', 'translate')} />);
    const cards = [...document.querySelectorAll('.wse-card')] as HTMLElement[];
    expect(cards.map((c) => c.querySelector('.wse-kind')!.textContent)).toEqual(['Fill in the blank', 'Multiple choice', 'Translate']);
    expect(within(cards[0]!).getByLabelText('Question 1')).toBeTruthy();
    expect(within(cards[0]!).getByLabelText('Answer to question 1')).toBeTruthy();
    expect(within(cards[0]!).getByRole('button', { name: /Insert a blank/ })).toBeTruthy();
    expect(within(cards[1]!).getByText('Choices')).toBeTruthy();
    expect(within(cards[1]!).getAllByRole('radio')).toHaveLength(2);
    expect(within(cards[2]!).getByLabelText('Phrase to translate in question 3')).toBeTruthy();
    expect(within(cards[2]!).getByLabelText('Interslavic answer to question 3')).toBeTruthy();
    expect(cards.every((c) => c.querySelector('.wse-badge')?.textContent === 'Yours')).toBe(true);
  });

  it('shows the blank in the sentence, and a ready-made table with only its title to change', () => {
    render(<Harness start={withCustom('question')} sel={{ exercises: [], tables: [tableLesson.slug], phrases: [] }} />);
    fireEvent.change(document.querySelector('[data-kind="fill"] textarea')!, { target: { value: 'Dajte ___ knigu.' } });
    expect(document.querySelector('.wse-preview .wse-blank')).toBeTruthy();
    const table = document.querySelector('[data-kind="table"]') as HTMLElement;
    expect(table).toBeTruthy();
    expect(within(table).getByLabelText(/Caption of table/)).toBeTruthy();
  });

  it('adds, edits, marks and removes choices', () => {
    render(<Harness start={withCustom('choice')} />);
    type('Choice 1 of question 1', 'ženě');
    type('Choice 2 of question 1', 'žene');
    expect((latest.custom[0]!.item as { options: string[] }).options).toEqual(['ženě', 'žene']);
    fireEvent.click(screen.getByLabelText('Choice 1 is the correct answer'));
    expect((latest.custom[0]!.item as { answer: string }).answer).toBe('ženě');
    // changing the words of the right choice carries the answer along
    type('Choice 1 of question 1', 'ženu');
    expect((latest.custom[0]!.item as { answer: string }).answer).toBe('ženu');
    expect((screen.getByLabelText('Choice 1 is the correct answer') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    expect((latest.custom[0]!.item as { options: string[] }).options).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByLabelText('Choice 3 of question 1'));
    fireEvent.click(screen.getByLabelText('Remove choice 1 of question 1')); // the correct one: nothing is correct now
    // two left: removing is switched off
    expect((screen.getByLabelText('Remove choice 1 of question 1') as HTMLButtonElement).disabled).toBe(true);
    expect((latest.custom[0]!.item as { answer: string }).answer).toBe('');
    expect(screen.getByText('No correct answer marked yet.')).toBeTruthy();
  });

  it('keeps the same text box (and focus) through many keystrokes', () => {
    render(<Harness start={withCustom('question', 'choice')} />);
    for (const label of ['Question 1', 'Answer to question 1', 'Question 2', 'Choice 1 of question 2']) {
      const el = screen.getByLabelText(label) as HTMLTextAreaElement;
      el.focus();
      let v = '';
      for (const ch of 'abcd') {
        v += ch;
        fireEvent.change(el, { target: { value: v } });
        expect(screen.getByLabelText(label)).toBe(el);
        expect(document.activeElement).toBe(el);
      }
      expect(el.value).toBe('abcd');
    }
  });

  it('grows its boxes instead of scrolling inside them', () => {
    render(<Harness start={withCustom('question')} />);
    const el = screen.getByLabelText('Question 1') as HTMLTextAreaElement;
    expect(getComputedStyle(el).overflow).not.toBe('scroll');
    expect(el.style.height).not.toBe('');
    expect(el.getAttribute('rows')).toBe('1');
  });

  it('deletes without asking, offers Undo, and puts the question back in place', () => {
    render(<Harness start={withCustom('question', 'choice', 'translate')} />);
    type('Question 2', 'second');
    fireEvent.click(screen.getByLabelText('Delete question 2'));
    expect(document.querySelectorAll('.wse-card')).toHaveLength(2);
    expect(screen.getByText('Question 2 deleted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const cards = [...document.querySelectorAll('.wse-card')];
    expect(cards).toHaveLength(3);
    expect((screen.getByLabelText('Question 2') as HTMLTextAreaElement).value).toBe('second');
    expect(screen.queryByText('Question 2 deleted')).toBeNull();
  });

  it('lets the Undo toast go after five seconds', async () => {
    const real = globalThis.setTimeout;
    render(<Harness start={withCustom('question', 'choice')} />);
    fireEvent.click(screen.getByLabelText('Delete question 1'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await act(async () => {
      await new Promise((r) => real(r, 5100));
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  }, 10000);

  it('moves a question up and down, and duplicates it', () => {
    render(<Harness start={withCustom('question', 'translate')} />);
    type('Question 1', 'first');
    expect((screen.getByLabelText('Move question 1 earlier') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Move question 1 later'));
    expect(document.querySelectorAll('.wse-card')[1]!.querySelector('.wse-kind')!.textContent).toBe('Fill in the blank');
    expect((document.querySelectorAll('.wse-card')[1]!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('first');
    fireEvent.click(screen.getByLabelText('Move question 2 earlier'));
    expect((document.querySelectorAll('.wse-card')[0]!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('first');
    fireEvent.click(screen.getByLabelText('Duplicate question 1'));
    const cards = document.querySelectorAll('.wse-card');
    expect(cards).toHaveLength(3);
    expect((cards[1]!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('first');
  });

  it('adds a question of the chosen kind from the bar, and folds the sections and settings', () => {
    render(<Harness />);
    expect(screen.getByText(/No questions yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Multiple choice/ }));
    expect(document.querySelector('[data-kind="choice"]')).toBeTruthy();
    const group = screen.getByRole('button', { name: /Exercises/ });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(group);
    expect(document.querySelector('.wse-card')).toBeNull();
    const settings = screen.getByRole('button', { name: /Sheet settings/ });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(settings);
    fireEvent.change(screen.getByLabelText('Worksheet title'), { target: { value: 'Quiz' } });
    expect((screen.getByLabelText('Worksheet title') as HTMLTextAreaElement).value).toBe('Quiz');
  });

  it('edits a ready-made question as a patch and marks it Yours', () => {
    render(<Harness sel={{ exercises: [casesLesson.slug], tables: [], phrases: [] }} />);
    type('Question 1', 'changed');
    expect(Object.keys(latest.patches)).toHaveLength(1);
    expect(document.querySelector('.wse-card .wse-badge')!.textContent).toBe('Yours');
    fireEvent.click(screen.getByLabelText('Delete question 1'));
    expect(latest.removed).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest.removed).toHaveLength(0);
  });
});

describe('draft helpers for the editor', () => {
  it('restores a deleted hand-written question to its place and order', () => {
    let d = addCustom(addCustom(emptyDraft(), 'Exercises', 'question').draft, 'Exercises', 'choice').draft;
    const ids = d.custom.map((c) => c.id);
    d = moveItem(d, 'Exercises', ids, ids[0]!, 1);
    const snap = snapshotItem(d, ids[0]!, 'Exercises');
    const gone = removeItem(d, ids[0]!);
    expect(gone.custom).toHaveLength(1);
    expect(restoreItem(gone, snap)).toEqual(d);
  });

  it('duplicates a phrase as the teacher\'s own', () => {
    const built = buildWorksheet({ exercises: [], tables: [], phrases: [PHRASEBOOK[0]!.title] }, LESSONS, PHRASEBOOK);
    const sheet = applyDraft(built, emptyDraft());
    const item = sheet[0]!.items[0]!;
    const r = duplicateItem(emptyDraft(), sheet[0]!.key, sheet[0]!.items.map((i) => i.id), item);
    const copy = applyDraft(built, r.draft)[0]!.items[1]!;
    expect(copy.id).toBe(r.id);
    expect(copy.kind === 'phrase' && copy.phrase.source).toBe('custom');
  });
});

describe('worksheet editor css', () => {
  it('keeps text boxes out of the page-wide textarea flex rule (it made them ignore their measured height)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('packages/web/src/phone/worksheets-edit.css', 'utf8');
    expect(css).toMatch(/\.wse \.wse-input \{[^}]*flex: none;/);
  });
});
