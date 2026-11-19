import { toCyrillic } from '../../../morph/src/orthography.ts';
import { sourceUrl, type Phrase, type PhraseGroup } from './phrasebook.ts';

/**
 * The phrasebook as a file Anki imports. The format is Anki's own text import
 * (https://docs.ankiweb.net/importing/text-files.html): tab-separated, with
 * `#key:value` header lines (Anki 2.1.54 and later) saying so; fields wrapped in
 * double quotes with any inner quote doubled; HTML switched on so a line break
 * can be `<br>`, which means `<`, `>` and `&` are written as entities.
 *
 * Two fields (front, back) so the default "Basic" note type takes them as they
 * are, and a third column of tags, named by `#tags column`.
 */

export type Direction = 'isv-en' | 'en-isv';

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A field as Anki reads it: no tab or newline of its own, quotes doubled, wrapped in quotes. */
export const field = (html: string): string => `"${html.replace(/[\t\r\n]+/g, ' ').replace(/"/g, '""')}"`;

/** Tags cannot hold spaces. */
export const tagOf = (title: string): string =>
  `Interslavic_${title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}`;

export const isvLines = (p: Phrase): string =>
  `<span lang="isv">${escapeHtml(p.isv)}</span><br><span lang="isv-Cyrl">${escapeHtml(toCyrillic(p.isv))}</span>`;

/** Where the phrase comes from, with the licence its source requires to travel with it. */
export const attribution = (p: Phrase): string =>
  p.source === 'dictionary'
    ? `<a href="${sourceUrl(p.source)}">Interslavic dictionary</a>`
    : `<a href="${sourceUrl(p.source)}">Tatoeba #${p.source}</a>, CC BY 2.0 FR`;

const meaning = (p: Phrase): string =>
  escapeHtml(p.en) + (p.note ? ` <i>(${escapeHtml(p.note)})</i>` : '');

export function ankiTsv(groups: PhraseGroup[], direction: Direction, deck = 'Interslavic phrasebook'): string {
  const lines = ['#separator:tab', '#html:true', '#tags column:3', `#deck:${deck}`];
  for (const g of groups) {
    for (const p of g.phrases) {
      const source = `<br><small>${attribution(p)}</small>`;
      const [front, back] =
        direction === 'isv-en'
          ? [isvLines(p), meaning(p) + source]
          : [meaning(p), isvLines(p) + source];
      lines.push([field(front), field(back), field(tagOf(g.title))].join('\t'));
    }
  }
  return lines.join('\n') + '\n';
}
