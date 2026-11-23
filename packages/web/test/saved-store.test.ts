// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SAVED, addSaved, isSaved, loadSaved, removeSaved } from '../src/saved/store.ts';

const item = (text: string, lang: 'en' | 'ru' | 'uk' = 'en') => ({ text, lang, script: 'standard', out: `out ${text}` });

describe('saved translations', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps newest first and one copy of the same text, language and script', () => {
    addSaved(item('a'));
    addSaved(item('b'));
    addSaved(item(' a '));
    expect(loadSaved().map((s) => s.text)).toEqual(['a', 'b']);
    addSaved(item('a', 'ru'));
    expect(loadSaved()).toHaveLength(3);
    expect(isSaved(loadSaved(), item('b'))).toBe(true);
  });

  it('removes one, and caps the list', () => {
    const id = addSaved(item('x'))[0]!.id;
    expect(removeSaved(id)).toEqual([]);
    for (let i = 0; i < MAX_SAVED + 5; i++) addSaved(item(`t${i}`));
    expect(loadSaved()).toHaveLength(MAX_SAVED);
    expect(loadSaved()[0]!.text).toBe(`t${MAX_SAVED + 4}`);
  });

  it('survives blocked or broken storage', () => {
    window.localStorage.setItem('interslavic-saved-v1', '{not json');
    expect(loadSaved()).toEqual([]);
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => addSaved(item('a'))).not.toThrow();
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
