import { cueSeconds, type Cue } from '../subtitles/srt.ts';

/** The cue being shown at time `t` (seconds): its start counts, its end does not. -1 between cues. */
export function cueAt(cues: Cue[], t: number): number {
  return cues.findIndex((c) => {
    const { start, end } = cueSeconds(c);
    return t >= start && t < end;
  });
}

/** The cue to show when `t` falls in a gap: the one that just ended, so words stay tappable. */
export function cueNear(cues: Cue[], t: number): number {
  const at = cueAt(cues, t);
  if (at >= 0) return at;
  let last = -1;
  cues.forEach((c, i) => {
    if (cueSeconds(c).end <= t) last = i;
  });
  return last;
}

/** m:ss, or h:mm:ss from an hour on. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
