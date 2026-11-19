import { describe, expect, it } from 'vitest';
import { clockOf } from '../src/transcribe/Elapsed.tsx';
import { stageText } from '../src/transcribe/run.ts';

describe('what the progress says', () => {
  it('says the percentage while the model downloads, and that it is starting once it is all there', () => {
    expect(stageText({ kind: 'model', fraction: 0.42 })).toBe('Getting the speech model… 42%');
    expect(stageText({ kind: 'model', fraction: 1 })).toContain('Starting the speech model');
  });
  it('says which part of a long recording it is on', () => {
    expect(stageText({ kind: 'speech', done: 1, total: 4 })).toBe('Transcribing part 2 of 4…');
    expect(stageText({ kind: 'audio' })).toBe('Reading the sound…');
    expect(stageText({ kind: 'done' })).toBeNull();
  });
  it('shows how long it has been as minutes and seconds', () => {
    expect(clockOf(0)).toBe('0:00');
    expect(clockOf(75)).toBe('1:15');
  });
});
