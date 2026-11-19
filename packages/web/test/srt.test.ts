import { describe, expect, it } from 'vitest';
import { formatSrt, parseSrt, planCue, type Cue } from '../src/subtitles/srt.ts';

const sample = `1
00:00:01,000 --> 00:00:03,500
Hello there.

2
00:00:04,000 --> 00:00:06,000 X1:100 X2:200
- Where are you going?
- Home.

3
00:00:07,000 --> 00:00:09,000
<i>I think that we should
go home now.</i>
`;

describe('parseSrt', () => {
  it('reads index, timing and lines', () => {
    const cues = parseSrt(sample);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({ index: 1, timing: '00:00:01,000 --> 00:00:03,500', lines: ['Hello there.'] });
    expect(cues[1]!.timing).toBe('00:00:04,000 --> 00:00:06,000 X1:100 X2:200');
    expect(cues[1]!.lines).toEqual(['- Where are you going?', '- Home.']);
  });

  it('copes with a BOM, Windows line endings and extra blank lines', () => {
    const cues = parseSrt('﻿' + sample.replace(/\n/g, '\r\n') + '\r\n\r\n\r\n');
    expect(cues).toHaveLength(3);
    expect(cues[2]!.lines).toEqual(['<i>I think that we should', 'go home now.</i>']);
  });

  it('accepts a file with no index lines and a "." before the milliseconds', () => {
    const cues = parseSrt('00:00:01.000 --> 00:00:02.000\nHi\n\n00:00:03.000 --> 00:00:04.000\nBye\n');
    expect(cues.map((c) => c.index)).toEqual([null, null]);
    expect(cues.map((c) => c.lines[0])).toEqual(['Hi', 'Bye']);
  });

  it('skips a block that has no time line rather than guessing', () => {
    expect(parseSrt('garbage\nmore garbage\n\n1\n00:00:01,000 --> 00:00:02,000\nok\n')).toHaveLength(1);
  });

  it('round-trips a well-formed file', () => {
    expect(formatSrt(parseSrt(sample))).toBe(sample);
  });

  it('numbers cues that had no number', () => {
    expect(formatSrt(parseSrt('00:00:01,000 --> 00:00:02,000\nHi\n'))).toBe('1\n00:00:01,000 --> 00:00:02,000\nHi\n');
  });
});

describe('planCue', () => {
  const cue = (lines: string[]): Cue => ({ index: 1, timing: '00:00:01,000 --> 00:00:02,000', lines });

  it('translates a sentence broken over two lines as one sentence', () => {
    const plan = planCue(cue(['I think that we should', 'go home now.']));
    expect(plan.units).toEqual(['I think that we should go home now.']);
    expect(plan.rebuild(['X'])).toEqual(['X']);
  });

  it('keeps each speaker of a dialogue on a line of their own, with the dash', () => {
    const plan = planCue(cue(['- Where are you going?', '- Home.']));
    expect(plan.units).toEqual(['Where are you going?', 'Home.']);
    expect(plan.rebuild(['A', 'B'])).toEqual(['- A', '- B']);
  });

  it('strips display markup before translating, and keeps a whole-cue italic', () => {
    const plan = planCue(cue(['<i>{\\an8}Hello</i>', '<i>there.</i>']));
    expect(plan.units).toEqual(['Hello there.']);
    expect(plan.rebuild(['Zdravo.'])).toEqual(['<i>Zdravo.</i>']);
  });

  it('does not italicise a cue that was only partly italic', () => {
    const plan = planCue(cue(['Hello <i>there</i>.']));
    expect(plan.rebuild(['Zdravo.'])).toEqual(['Zdravo.']);
  });

  it('leaves a cue with no letters - music, empty - exactly as it was', () => {
    const lines = ['♪ ♪'];
    const plan = planCue(cue(lines));
    expect(plan.units).toEqual([]);
    expect(plan.rebuild([])).toEqual(lines);
  });
});
