import { applyPreset, DEFAULT_STYLE } from '../editor/text-style.ts';
import { newLayer, type TextLayer } from '../editor/layers.ts';
import { cueSeconds, type Cue } from '../subtitles/srt.ts';
import { fromSource, length, speedOf, total, type Clip } from './timeline.ts';

/** The style new on-screen text starts with: the "Subtitle" look, sized to the frame. */
export const defaultTextStyle = (frameH: number) => ({ ...applyPreset(DEFAULT_STYLE, 'subtitle'), size: Math.max(18, Math.round(frameH / 16)) });

/**
 * Subtitles as text on the video. A cue's times belong to the SOURCE video, so
 * they are mapped through the clips: a cue that falls in a part that was cut
 * out is left out, and one in a moved clip moves with it. Each becomes a text
 * layer near the bottom of the frame, with the subtitle look.
 */
/** Where, on the edit's clock, a time inside ONE source falls: only the clips that play that source count. */
function fromSourceOf(clips: Clip[], source: number, srcId: string): number | null {
  let at = 0;
  for (const c of clips) {
    if (c.srcId === srcId && source >= c.start && source < c.end) return at + (source - c.start) / speedOf(c);
    at += length(c);
  }
  return null;
}

export function layersFromCues(cues: Cue[], clips: Clip[], frame: { w: number; h: number }, srcId?: string): { layers: TextLayer[]; left: number } {
  const map = (t: number): number | null => (srcId === undefined ? fromSource(clips, t) : fromSourceOf(clips, t, srcId));
  const layers: TextLayer[] = [];
  let left = 0;
  const end = total(clips);
  for (const cue of cues) {
    const { start, end: srcEnd } = cueSeconds(cue);
    const text = cue.lines.map((l) => l.replace(/<[^>]+>|\{\\[^}]*\}/g, '').trim()).filter(Boolean).join('\n');
    const from = map(start);
    if (from === null || text === '') {
      if (text !== '') left++;
      continue;
    }
    const tail = map(Math.max(start, srcEnd - 0.001));
    const to = Math.min(end, tail !== null ? tail + 0.001 : from + (srcEnd - start));
    layers.push(
      newLayer({
        text,
        x: frame.w * 0.08,
        y: frame.h * 0.76,
        maxWidth: frame.w * 0.84,
        start: from,
        end: Math.max(to, from + 0.2),
        style: defaultTextStyle(frame.h),
      }),
    );
  }
  return { layers, left };
}
