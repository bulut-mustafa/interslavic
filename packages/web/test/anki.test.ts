import { describe, expect, it } from 'vitest';
import { ankiTsv, attribution } from '../src/learn/anki.ts';
import { PHRASEBOOK, type PhraseGroup } from '../src/learn/phrasebook.ts';
import { toCyrillic } from '../../morph/src/orthography.ts';

/** What Anki does with a file: split into lines, drop the "#" headers, read quoted tab-separated fields. */
function rows(tsv: string): string[][] {
  return tsv
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t').map((f) => f.slice(1, -1).replace(/""/g, '"')));
}

const all = PHRASEBOOK.flatMap((g) => g.phrases);

describe('Anki export of the phrasebook', () => {
  it('starts with the headers Anki 2.1.54+ reads, and names the tag column', () => {
    const head = ankiTsv(PHRASEBOOK, 'isv-en').split('\n').filter((l) => l.startsWith('#'));
    expect(head).toEqual(['#separator:tab', '#html:true', '#tags column:3', '#deck:Interslavic phrasebook']);
  });

  it('has one note per phrase, each with exactly front, back and tags', () => {
    for (const dir of ['isv-en', 'en-isv'] as const) {
      const r = rows(ankiTsv(PHRASEBOOK, dir));
      expect(r).toHaveLength(all.length);
      expect(r.every((f) => f.length === 3)).toBe(true);
    }
  });

  it('puts the Interslavic and its Cyrillic on one side and the meaning on the other', () => {
    const p = all[0]!;
    const forward = rows(ankiTsv(PHRASEBOOK, 'isv-en'))[0]!;
    expect(forward[0]).toContain(p.isv);
    expect(forward[0]).toContain(toCyrillic(p.isv));
    expect(forward[1]).toContain(p.en.replace(/&/g, '&amp;'));
    const reverse = rows(ankiTsv(PHRASEBOOK, 'en-isv'))[0]!;
    expect(reverse[0]).toContain(p.en.replace(/&/g, '&amp;'));
    expect(reverse[1]).toContain(p.isv);
  });

  it('carries each phrase\'s source, and the Tatoeba licence with every Tatoeba sentence', () => {
    for (const p of all) {
      const back = rows(ankiTsv([{ title: 't', phrases: [p] }], 'isv-en'))[0]![1]!;
      if (p.source === 'dictionary') expect(back).toContain('Interslavic dictionary');
      else {
        expect(back).toContain(`Tatoeba #${p.source}`);
        expect(back).toContain('CC BY 2.0 FR');
        expect(back).toContain(`https://tatoeba.org/en/sentences/show/${p.source}`);
      }
    }
    expect(attribution({ isv: 'x', en: 'x', source: 5 })).toContain('CC BY 2.0 FR');
  });

  it('tags each note with its topic, without spaces', () => {
    const tags = new Set(rows(ankiTsv(PHRASEBOOK, 'isv-en')).map((f) => f[2]));
    expect(tags.size).toBe(PHRASEBOOK.length);
    for (const t of tags) expect(t).toMatch(/^Interslavic_[^\s]+$/);
  });

  it('survives quotes, tabs, newlines, ampersands and angle brackets in a phrase', () => {
    const odd: PhraseGroup[] = [
      {
        title: 'Odd & "quoted" topic',
        phrases: [{ isv: 'Say "da"\tnow', en: 'Tom & Jerry <b>\nloud', source: 'dictionary', note: 'a "note"' }],
      },
    ];
    const tsv = ankiTsv(odd, 'isv-en');
    const body = tsv.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(body).toHaveLength(1); // the newline in the English did not split the row
    const [front, back, tag] = rows(tsv)[0]!;
    expect(front).toContain('Say "da" now');
    expect(back).toContain('Tom &amp; Jerry &lt;b&gt; loud');
    expect(back).toContain('a "note"');
    expect(tag).toBe('Interslavic_Odd_quoted_topic');
  });

  it('writes the same file every time', () => {
    expect(ankiTsv(PHRASEBOOK, 'isv-en')).toBe(ankiTsv(PHRASEBOOK, 'isv-en'));
  });
});
