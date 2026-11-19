// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';
import { contributions } from '../src/worksheets/build.ts';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/studio/worksheets');
  window.print = vi.fn();
});
afterEach(() => cleanup());

const casesLesson = LESSONS.find((l) => l.slug === 'cases')!;

describe('the Worksheets page', () => {
  it('is in the navigation, and starts with a first worksheet already on the page', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Worksheets' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByLabelText('Worksheet preview')).toBeTruthy();
    expect(screen.queryByText('Nothing selected yet.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Print or save as PDF' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says what to do when everything is cleared', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Nothing selected yet.')).toBeTruthy();
    expect(screen.getByText(/Pick topics on the right/)).toBeTruthy();
    expect(screen.queryByLabelText('Worksheet preview')).toBeNull();
  });

  it('builds the worksheet from the chosen lesson, with its answer key', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const exercises = screen.getByRole('group', { name: 'Exercises from' });
    fireEvent.click(within(exercises).getByLabelText(new RegExp(`^${casesLesson.title}`)));
    const sheet = screen.getByLabelText('Worksheet preview');
    expect([...sheet.querySelectorAll('.ws-static')].some((e) => /Dajte ___ knigu/.test(e.textContent ?? ''))).toBe(true); // on the page as it will be printed
    // The answer key has the lesson's answer and its reason.
    const key = sheet.querySelector('.worksheet-answers')!;
    expect([...key.querySelectorAll('strong')].some((e) => e.textContent === 'ženě')).toBe(true);
    expect(key.textContent).toContain('The person something is given to is in the dative');
    expect(screen.getByText(`${contributions(casesLesson).exercises} items on the worksheet.`)).toBeTruthy();
  });

  it('gives a fill-in question without its own blank a line to write on', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const lesson = LESSONS.find((l) => l.blocks.some((b) => b.kind === 'fill' && !b.prompt.includes('___')))!;
    fireEvent.click(within(screen.getByRole('group', { name: 'Exercises from' })).getByLabelText(new RegExp(`^${lesson.title}`)));
    const sheet = screen.getByLabelText('Worksheet preview');
    const asked = sheet.querySelector('.worksheet-section .worksheet-items')!;
    expect(asked.querySelectorAll('.blank.wide').length).toBeGreaterThan(0);
  });

  it('leaves the answer key out when asked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Exercises from' })).getByLabelText(new RegExp(`^${casesLesson.title}`)));
    fireEvent.click(screen.getByLabelText('Add an answer key on a new page'));
    expect(document.querySelector('.worksheet-answers')).toBeNull();
    expect(screen.getByLabelText('Add an answer key on a new page').getAttribute('aria-checked')).toBe('false');
  });

  it('turns a phrasebook topic into translate-this questions and keeps the Tatoeba credit in the key', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const topic = PHRASEBOOK.find((g) => g.phrases.some((p) => typeof p.source === 'number'))!;
    fireEvent.click(within(screen.getByRole('group', { name: 'Phrases from' })).getByLabelText(new RegExp(`^${topic.title}`)));
    const sheet = screen.getByLabelText('Worksheet preview');
    expect(within(sheet).getByText(/CC BY 2.0 FR/)).toBeTruthy();
    const tatoeba = topic.phrases.find((p) => typeof p.source === 'number')!;
    expect(within(sheet).getByText(`Tatoeba ${tatoeba.source}`)).toBeTruthy();
  });

  it('prints only when there is something to print', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Select everything' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect((screen.getByRole('button', { name: 'Print or save as PDF' }) as HTMLButtonElement).disabled).toBe(true);
  });
});


/** Editing the questions on the page itself. */
describe('changing the questions', () => {
  const alphabet = LESSONS.find((l) => l.slug === 'alphabet')!;
  const open = () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Exercises from' })).getByLabelText(new RegExp(`^${alphabet.title}`)));
  };
  const sheet = () => screen.getByLabelText('Worksheet preview');
  const printed = () => [...sheet().querySelectorAll('.ws-static')].map((e) => e.textContent).join('\n');
  const key = () => sheet().querySelector('.worksheet-answers')!.textContent!;
  /** The number of the question that asks about школа. */
  const school = () => Number((screen.getAllByLabelText(/^Question \d+$/) as HTMLTextAreaElement[]).find((t) => t.value.includes('школа'))!.getAttribute('aria-label')!.replace(/\D/g, ''));
  /** The marks on questions that are the teacher's own (there is also one in the note above the page). */
  const mine = () => document.querySelectorAll('.ws-item-head .ws-badge').length;
  const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('lets the question about школа be changed to another word, and its answer too', () => {
    open();
    const n = school();
    expect(key()).toContain('škola');
    type(`Question ${n}`, 'Write in Latin letters: **книга**');
    type(`Answer to question ${n}`, 'kniga');
    expect(printed()).toContain('книга');
    expect(printed()).not.toContain('школа');
    expect(key()).toContain('kniga');
    expect(key()).not.toContain('škola');
  });

  it('marks a question that was changed as the teacher\'s own, and can put it back as it was', () => {
    open();
    const n = school();
    expect(mine()).toBe(0);
    type(`Question ${n}`, 'my own words');
    expect(mine()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: `Put question ${n} back as it was` }));
    expect(mine()).toBe(0);
    expect(printed()).toContain('школа');
  });

  it('adds a question of one\'s own to a section, with its answer, numbered after the others and in the key', () => {
    open();
    const before = screen.getAllByLabelText(/^Question \d+$/).length;
    fireEvent.click(within(screen.getByRole('group', { name: 'Add to Exercises' })).getByRole('button', { name: /Question/ }));
    const n = before + 1;
    type(`Question ${n}`, 'Write in Latin letters: **ђак**');
    type(`Answer to question ${n}`, 'đak');
    expect(printed()).toContain('ђак');
    expect(key()).toContain('đak');
    expect(mine()).toBe(1);
    expect(screen.getByText(`${before + 1} ${before + 1 === 1 ? 'item' : 'items'} on the worksheet.`)).toBeTruthy();
  });

  it('adds a multiple-choice question: its choices appear, and the right one is in the key', () => {
    open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Add to Exercises' })).getByRole('button', { name: /Multiple choice/ }));
    const n = screen.getAllByLabelText(/^Choices for question/).length ? Number(screen.getAllByLabelText(/^Choices for question/).at(-1)!.getAttribute('aria-label')!.replace(/\D/g, '')) : 0;
    type(`Question ${n}`, 'Which letter is a vowel?');
    type(`Choices for question ${n}`, 'б\nа\nв');
    fireEvent.change(screen.getByLabelText(`Right answer to question ${n}`), { target: { value: 'а' } });
    expect(printed()).toContain('Which letter is a vowel?');
    expect([...sheet().querySelectorAll('.ws-static .worksheet-option')].map((o) => o.textContent).slice(-3)).toEqual(['○ б', '○ а', '○ в']);
    expect(key()).toContain('а');
  });

  it('adds a phrase to translate, with no source to point to, and no dictionary credit when it is the only phrase', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write a question' }));
    const group = screen.getByRole('group', { name: 'Add to Exercises' });
    fireEvent.click(within(group).getByRole('button', { name: /Phrase to translate/ }));
    const phrases = screen.getAllByLabelText(/^Phrase to translate in question/);
    const n = Number(phrases.at(-1)!.getAttribute('aria-label')!.replace(/\D/g, ''));
    type(`Phrase to translate in question ${n}`, 'Thank you');
    type(`Interslavic answer to question ${n}`, 'Hvala');
    expect(printed()).toContain('Thank you');
    expect(key()).toContain('Hvala');
    expect(sheet().querySelector('.worksheet-answers .phrase-source')).toBeNull();
    expect(key()).not.toContain('Tatoeba');
  });

  it('removes a question, renumbers, and can bring it back', () => {
    open();
    const total = Number(screen.getByText(/items? on the worksheet/).textContent!.match(/^\d+/)![0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove question 1' }));
    expect(screen.getByText(`${total - 1} ${total - 1 === 1 ? 'item' : 'items'} on the worksheet.`)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Remove question \d+$/ })).toHaveLength(total - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Bring back 1 removed question' }));
    expect(screen.getByText(`${total} ${total === 1 ? 'item' : 'items'} on the worksheet.`)).toBeTruthy();
  });

  it('moves a question later and earlier, and the numbers follow', () => {
    open();
    const first = (screen.getByLabelText('Question 1') as HTMLTextAreaElement).value;
    const second = (screen.getByLabelText('Question 2') as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Move question 1 later' }));
    expect((screen.getByLabelText('Question 1') as HTMLTextAreaElement).value).toBe(second);
    expect((screen.getByLabelText('Question 2') as HTMLTextAreaElement).value).toBe(first);
    expect((screen.getByRole('button', { name: 'Move question 1 earlier' }) as HTMLButtonElement).disabled).toBe(true); // nothing above the first
  });

  it('renames a section and changes what it asks of the student', () => {
    open();
    type('Title of section Exercises', 'Warm-up');
    type('Instruction for Warm-up', 'Write each word in Latin letters.');
    expect(printed()).toContain('Warm-up');
    expect(printed()).toContain('Write each word in Latin letters.');
    expect(key()).toContain('Warm-up');
  });

  it('adds a section of one\'s own, with a question in it, and removes it again', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Add a section/ }));
    type('Title of section New section', 'Reading');
    fireEvent.click(within(screen.getByRole('group', { name: 'Add to Reading' })).getByRole('button', { name: /Question/ }));
    expect(printed()).toContain('Reading');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the section Reading' }));
    expect(printed()).not.toContain('Reading');
  });

  it('keeps what was changed when other topics are chosen', () => {
    open();
    const n = school();
    type(`Question ${n}`, 'my own words');
    fireEvent.click(within(screen.getByRole('group', { name: 'Exercises from' })).getByLabelText(/^The cases/));
    expect(printed()).toContain('my own words');
    expect(printed()).toContain('Dajte ___ knigu');
  });

  it('is shown without the editing controls in the preview, and with them back when editing again', () => {
    open();
    expect(document.querySelector('.ws-item-edit')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Edit questions'));
    expect(document.querySelector('.ws-item-edit')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add a section/ })).toBeNull();
    expect(printed()).toBe(''); // (the page itself is shown directly, not the printed copy beside the editor)
    expect(sheet().textContent).toContain('школа');
    fireEvent.click(screen.getByLabelText('Edit questions'));
    expect(document.querySelector('.ws-item-edit')).toBeTruthy();
  });

  it('keeps the worksheet for next time, edits and all', async () => {
    open();
    const n = school();
    type(`Question ${n}`, 'kept for later');
    type('Title', 'Week 3');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    cleanup();
    render(<App />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Week 3');
    expect(sheet().querySelector('.worksheet-items')!.textContent).toContain('kept for later');
    expect(mine()).toBe(1);
  });

  it('can start over, after asking', () => {
    open();
    type(`Question ${school()}`, 'something else');
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(mine()).toBe(1); // nothing was thrown away
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard them' }));
    expect(mine()).toBe(0);
    expect(printed()).toContain('школа');
  });

  it('starts from nothing when everything is cleared, with a place to write the first question', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Write a question' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Write a question' }));
    expect(screen.getByLabelText('Question 1')).toBeTruthy();
  });
});
