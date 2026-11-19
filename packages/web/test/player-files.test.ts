import { describe, expect, it } from 'vitest';
import { assignSubtitles, isMedia, isSubtitles } from '../src/player/files.ts';

const srt = (text: string) => `1\n00:00:01,000 --> 00:00:02,000\n${text}\n`;

describe('telling dropped files apart', () => {
  it('knows videos, audio and subtitles by type or by name', () => {
    expect(isMedia({ name: 'a.mp4', type: 'video/mp4' })).toBe(true);
    expect(isMedia({ name: 'a.mkv', type: '' })).toBe(true);
    expect(isMedia({ name: 'a.mp3', type: 'audio/mpeg' })).toBe(true);
    expect(isMedia({ name: 'a.srt', type: '' })).toBe(false);
    expect(isSubtitles({ name: 'a.SRT', type: '' })).toBe(true);
    expect(isSubtitles({ name: 'a.txt', type: 'text/plain' })).toBe(false);
  });
});

describe('assignSubtitles', () => {
  it('takes a lone file as the Interslavic', () => {
    expect(assignSubtitles([{ name: 'film.srt', text: srt('Dobry denj') }]).isv?.name).toBe('film.srt');
    expect(assignSubtitles([])).toEqual({});
  });
  it('takes the file whose name says Interslavic', () => {
    const r = assignSubtitles([{ name: 'film.en.srt', text: srt('Good day to you all') }, { name: 'film.isv.srt', text: srt('Dobry denj vsim vam') }]);
    expect(r.isv?.name).toBe('film.isv.srt');
    expect(r.original?.name).toBe('film.en.srt');
  });
  it('takes a Russian or Ukrainian text as the original, whatever the names', () => {
    const r = assignSubtitles([{ name: 'a.srt', text: srt('Добрый день, друзья мои') }, { name: 'b.srt', text: srt('Dobry denj vsim vam') }]);
    expect(r.isv?.name).toBe('b.srt');
    expect(r.original?.name).toBe('a.srt');
  });
  it('falls back to the first as the Interslavic when nothing tells them apart', () => {
    const r = assignSubtitles([{ name: 'one.srt', text: srt('Dobry denj vsim vam') }, { name: 'two.srt', text: srt('Good day to you all') }]);
    expect(r.isv?.name).toBe('one.srt');
    expect(r.original?.name).toBe('two.srt');
  });
});
