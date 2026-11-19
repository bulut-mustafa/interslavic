// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseSrt, cueSeconds } from '../src/subtitles/srt.ts';
import { clock, cueAt, cueNear } from '../src/player/timeline.ts';
import { addNote, clearNotes, loadNotes, removeNote } from '../src/player/notebook.ts';
import { notesTsv } from '../src/player/notes-anki.ts';
import { toCyrillic } from '../../morph/src/orthography.ts';

const cues = parseSrt(`1
00:00:01,000 --> 00:00:03,000
Prvy.

2
00:00:03,000 --> 00:00:05,500
Drugy.

3
00:01:10.250 --> 01:01:10,000
Tretji.
`);

describe('cueSeconds', () => {
  it('reads start and end, with a comma or a point before the milliseconds', () => {
    expect(cueSeconds(cues[0]!)).toEqual({ start: 1, end: 3 });
    expect(cueSeconds(cues[2]!)).toEqual({ start: 70.25, end: 3670 });
  });
});

describe('cueAt', () => {
  it('counts a cue\'s start but not its end, so back-to-back cues never overlap', () => {
    expect(cueAt(cues, 1)).toBe(0);
    expect(cueAt(cues, 2.999)).toBe(0);
    expect(cueAt(cues, 3)).toBe(1);
  });
  it('is -1 before the first cue and in a gap', () => {
    expect(cueAt(cues, 0.5)).toBe(-1);
    expect(cueAt(cues, 6)).toBe(-1);
  });
});

describe('cueNear', () => {
  it('keeps the cue that just ended while in a gap, and is -1 before any cue', () => {
    expect(cueNear(cues, 6)).toBe(1);
    expect(cueNear(cues, 0.2)).toBe(-1);
    expect(cueNear(cues, 2)).toBe(0);
  });
});

describe('clock', () => {
  it('writes m:ss, and h:mm:ss from an hour on', () => {
    expect(clock(5)).toBe('0:05');
    expect(clock(125.9)).toBe('2:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});

describe('notebook', () => {
  beforeEach(() => window.localStorage.clear());
  it('saves, lists and removes notes in this browser', () => {
    addNote({ isv: 'Dobry denj!', video: 'a.mp4', at: 12 });
    addNote({ isv: 'Hvala.', original: 'Thanks.', video: 'a.mp4', at: 30 });
    expect(loadNotes().map((n) => n.isv)).toEqual(['Dobry denj!', 'Hvala.']);
    removeNote(loadNotes()[0]!.id);
    expect(loadNotes().map((n) => n.isv)).toEqual(['Hvala.']);
    clearNotes();
    expect(loadNotes()).toEqual([]);
  });
  it('does not save the same sentence from the same moment twice', () => {
    addNote({ isv: 'Hvala.', video: 'a.mp4', at: 30 });
    addNote({ isv: 'Hvala.', video: 'a.mp4', at: 30 });
    expect(loadNotes()).toHaveLength(1);
  });
  it('survives storage that is broken', () => {
    window.localStorage.setItem('interslavic-notes-v1', '{not json');
    expect(loadNotes()).toEqual([]);
  });
});

describe('notesTsv', () => {
  const notes = [{ id: '1', isv: 'Dobry denj!', original: 'Good day! & <hi>', video: 'my "film".mp4', at: 3725 }];
  it('uses the same headers as the phrasebook export', () => {
    expect(notesTsv(notes, 'isv-en').split('\n').filter((l) => l.startsWith('#'))).toEqual([
      '#separator:tab', '#html:true', '#tags column:3', '#deck:Interslavic from video',
    ]);
  });
  const rows = (tsv: string) => tsv.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t').map((f) => f.slice(1, -1).replace(/""/g, '"')));
  it('puts the Interslavic with its Cyrillic on the front, the original and the source on the back', () => {
    const [front, back, tag] = rows(notesTsv(notes, 'isv-en'))[0]!;
    expect(front).toContain('Dobry denj!');
    expect(front).toContain(toCyrillic('Dobry denj!'));
    expect(back).toContain('Good day! &amp; &lt;hi&gt;');
    expect(back).toContain('my "film".mp4, 1:02:05');
    expect(tag).toBe('Interslavic_video');
  });
  it('turns around for the other direction', () => {
    const [front, back] = rows(notesTsv(notes, 'en-isv'))[0]!;
    expect(front).toBe('Good day! &amp; &lt;hi&gt;');
    expect(back).toContain('Dobry denj!');
  });
  it('still has a front when there are no original subtitles', () => {
    const [front] = rows(notesTsv([{ ...notes[0]!, original: undefined }], 'en-isv'))[0]!;
    expect(front).toContain('1:02:05');
  });
});
