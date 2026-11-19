import type { Cue } from '../subtitles/srt.ts';

/**
 * From Whisper's timestamped chunks to subtitle cues.
 *
 * A chunk is the text of one stretch of speech with its start and end in
 * seconds; the last end can be missing when the audio stops mid-sentence.
 */

export interface Chunk {
  text: string;
  timestamp: [number, number | null];
}

/** 3725.5 seconds as "01:02:05,500". */
export function srtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** A subtitle is kept to about this many characters and this many seconds, so it can be read in the time it is on screen. */
export const MAX_CUE_CHARS = 84;
export const MAX_CUE_SECONDS = 6;

/**
 * Cuts a stretch of speech that is too long for a subtitle at the ends of its
 * sentences, sharing its time out by length. Used when the model gave no times
 * for single words; the times inside such a stretch are therefore estimates,
 * though the words are exactly what was heard.
 */
export function splitLong(chunks: Chunk[]): Chunk[] {
  return chunks.flatMap((c) => {
    const text = c.text.replace(/\s+/g, ' ').trim();
    const [start, end] = c.timestamp;
    if (end === null || text.length <= MAX_CUE_CHARS || end - start <= MAX_CUE_SECONDS) return [c];
    // sentences first; a sentence still too long is cut between words
    const pieces: string[] = [];
    for (const sentence of text.split(/(?<=[.!?…]["')\]]*)\s+/)) {
      let rest = sentence;
      while (rest.length > MAX_CUE_CHARS) {
        const cut = rest.lastIndexOf(' ', MAX_CUE_CHARS);
        pieces.push(rest.slice(0, cut > 0 ? cut : MAX_CUE_CHARS));
        rest = rest.slice(cut > 0 ? cut + 1 : MAX_CUE_CHARS);
      }
      if (rest) pieces.push(rest);
    }
    // neighbouring short sentences share a subtitle while they fit
    const merged: string[] = [];
    for (const p of pieces) {
      const last = merged[merged.length - 1];
      if (last !== undefined && last.length + 1 + p.length <= MAX_CUE_CHARS) merged[merged.length - 1] = `${last} ${p}`;
      else merged.push(p);
    }
    if (merged.length < 2) return [c];
    const all = merged.reduce((n, p) => n + p.length, 0);
    let at = start;
    return merged.map((p) => {
      const to = at + ((end - start) * p.length) / all;
      const chunk: Chunk = { text: p, timestamp: [at, to] };
      at = to;
      return chunk;
    });
  });
}

/** A cue shorter than this cannot be read; it is stretched, never past the next cue's start. */
const MIN_SECONDS = 0.5;

/**
 * Chunks become cues in order. Empty text is dropped; a missing end is the end
 * of the audio; no cue runs into the next one.
 */
export function chunksToCues(chunks: Chunk[], durationSeconds: number): Cue[] {
  const spoken = chunks
    .map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim(), start: c.timestamp[0], end: c.timestamp[1] }))
    .filter((c) => c.text !== '')
    .sort((a, b) => a.start - b.start);

  return spoken.map((c, i) => {
    const nextStart = spoken[i + 1]?.start ?? durationSeconds;
    let end = Math.min(c.end ?? durationSeconds, nextStart);
    if (end - c.start < MIN_SECONDS) end = Math.min(c.start + MIN_SECONDS, Math.max(nextStart, c.start));
    return { index: i + 1, timing: `${srtTime(c.start)} --> ${srtTime(end)}`, lines: [c.text] };
  });
}

/**
 * Cut points for splitting long audio into segments of about `targetSeconds`,
 * each at the quietest moment within `searchSeconds` either side of the target,
 * so a cut rarely lands inside a word. Returns sample offsets, strictly
 * increasing, not including 0 or the end.
 */
export function quietCuts(samples: Float32Array, sampleRate: number, targetSeconds: number, searchSeconds = 5): number[] {
  const cuts: number[] = [];
  const target = Math.round(targetSeconds * sampleRate);
  const search = Math.round(searchSeconds * sampleRate);
  const frame = Math.round(0.1 * sampleRate); // 100 ms windows
  let from = 0;
  while (samples.length - from > target + search) {
    const centre = from + target;
    let best = centre;
    let quietest = Infinity;
    for (let at = centre - search; at <= centre + search; at += frame) {
      let energy = 0;
      for (let k = at; k < at + frame && k < samples.length; k++) energy += samples[k]! * samples[k]!;
      if (energy < quietest) {
        quietest = energy;
        best = at + Math.floor(frame / 2);
      }
    }
    cuts.push(best);
    from = best;
  }
  return cuts;
}

/** Many channels as one: the mean of each sample across channels. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const out = new Float32Array(channels[0]!.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i]!;
  for (let i = 0; i < out.length; i++) out[i]! /= channels.length;
  return out;
}

/**
 * Many channels as one, written into the first channel instead of a new array.
 * An hour of 16 kHz sound is 230 MB a channel, so mixing without a copy keeps
 * the peak at the decoded sound alone. The first channel is changed; use this
 * only on sound that is about to be thrown away.
 */
export function mixToMonoInPlace(channels: Float32Array[]): Float32Array {
  const out = channels[0]!;
  if (channels.length === 1) return out;
  const n = channels.length;
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) sum += channels[c]![i]!;
    out[i] = sum / n;
  }
  return out;
}
