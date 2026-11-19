import { toCyrillic } from '../../../morph/src/orthography.ts';
import { escapeHtml, field, isvLines, type Direction } from '../learn/anki.ts';
import { clock } from './timeline.ts';
import type { Note } from './notebook.ts';

/**
 * Saved video sentences as an Anki text import, in the same format as the
 * phrasebook's (see learn/anki.ts): one note per sentence, its source - the
 * video's name and the time - on the card, and one tag for all of them.
 */
export function notesTsv(notes: Note[], direction: Direction, deck = 'Interslavic from video'): string {
  const lines = ['#separator:tab', '#html:true', '#tags column:3', `#deck:${deck}`];
  for (const n of notes) {
    const source = `<small>${escapeHtml(n.video)}, ${clock(n.at)}</small>`;
    const isv = isvLines({ isv: n.isv, en: '', source: 'dictionary' });
    const original = n.original ? escapeHtml(n.original) : '';
    const [front, back] =
      direction === 'isv-en'
        ? [isv, [original, source].filter(Boolean).join('<br>')]
        : [original || escapeHtml(`(${clock(n.at)})`), `${isv}<br>${source}`];
    lines.push([field(front), field(back), field('Interslavic_video')].join('\t'));
  }
  return lines.join('\n') + '\n';
}

export { toCyrillic };
