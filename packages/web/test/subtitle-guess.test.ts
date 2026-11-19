import { describe, expect, it } from 'vitest';
import { guessLang } from '../src/subtitles/guess.ts';

describe('guessLang', () => {
  it('knows English, Russian and Ukrainian by their letters', () => {
    expect(guessLang('1\n00:00:01,000 --> 00:00:02,000\nWelcome to our shop.\n')).toBe('en');
    expect(guessLang('1\n00:00:01,000 --> 00:00:02,000\nДобро пожаловать в наш магазин.\n')).toBe('ru');
    expect(guessLang('1\n00:00:01,000 --> 00:00:02,000\nЛаскаво просимо до нашої крамниці, їжак.\n')).toBe('uk');
  });
  it('ignores time lines and cue numbers, which look the same everywhere', () => {
    expect(guessLang('12\n00:00:01,000 --> 00:00:02,000\n')).toBeNull();
  });
  it('does not guess from almost nothing', () => {
    expect(guessLang('Hi')).toBeNull();
    expect(guessLang('')).toBeNull();
  });
  it('goes by the larger script when a file mixes them', () => {
    expect(guessLang('Привет, это очень длинное предложение с одним word.')).toBe('ru');
  });
});
