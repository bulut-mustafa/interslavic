import { newId } from '../editor/layers.ts';
import { MIN_CLIP, locate, splitAt, type Clip } from './timeline.ts';

/**
 * Freeze frame: take one picture out of a video and hold it on the main track.
 *
 * DECISION (see docs/ideas/video-research-audio.md): a still on the main track
 * is an ordinary `Clip` whose `srcId` names an IMAGE source. `Clip` needs no
 * `kind`: `schedule.ts` already reads the kind from the source (an image's
 * expected source time is 0) and `length(clip)` is `end - start`, so the still
 * is `{start: 0, end: seconds}`. The only new thing is the image source (a
 * `Source` of kind 'image' with the blob saved like any upload), which the
 * caller adds.
 */

export interface FreezeEnv {
  createCanvas(): HTMLCanvasElement;
  /** How long to wait for `seeked` before giving up. */
  timeoutMs: number;
}

export const freezeEnv: FreezeEnv = { createCanvas: () => document.createElement('canvas'), timeoutMs: 5000 };

/** Which source file and which moment in it the picture at edit time `t` comes from; null when it is not a plain source video. */
export function freezeSourceTime(clips: Clip[], t: number): { srcId: string; time: number } | null {
  const loc = locate(clips, t);
  const clip = loc && clips[loc.index];
  if (!loc || !clip?.srcId) return null;
  return { srcId: clip.srcId, time: loc.source };
}

function seekTo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<void> {
  // MDN does not say whether `seeked` fires for a seek to where the video already is, so that case never waits.
  if (Math.abs(video.currentTime - time) < 0.001 && !video.seeking && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      if (err) reject(err);
      else resolve();
    };
    const onSeeked = () => done();
    const timer = setTimeout(() => done(new Error('The video did not finish seeking to that frame.')), timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

/**
 * The picture of `video` at `sourceTime` as a PNG (or JPEG) file. Waits for
 * `seeked` first because drawImage on a video is only right once the seek has
 * finished (MDN, drawImage notes). Rejects with a readable message otherwise.
 */
export async function freezeFrame(video: HTMLVideoElement, sourceTime: number, format: 'png' | 'jpeg' = 'png', env: FreezeEnv = freezeEnv): Promise<Blob> {
  await seekTo(video, sourceTime, env.timeoutMs);
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('The video has no picture to take yet.');
  const canvas = env.createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not make a drawing surface.');
  ctx.drawImage(video, 0, 0, w, h);
  const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise<Blob>((resolve, reject) => {
    // toBlob throws SecurityError for a tainted canvas and passes null when it cannot make the image.
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not make a picture from that frame.'))), type, format === 'jpeg' ? 0.92 : undefined);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Holds the picture at edit time `editTime` for `seconds`: splits the main-track
 * clip there and puts a still clip of image source `sourceId` between the two
 * halves. Within MIN_CLIP of a clip's edge it goes at that edge instead
 * (no sliver). Returns the same list for an empty track, a missing source id
 * or a length that is not above zero.
 */
export function insertFreeze(clips: Clip[], editTime: number, sourceId: string, seconds: number): Clip[] {
  if (!sourceId || !(seconds > 0)) return clips;
  const loc = locate(clips, editTime);
  const c = loc && clips[loc.index];
  if (!loc || !c) return clips;
  const still: Clip = { id: newId('c'), start: 0, end: seconds, srcId: sourceId };
  if (loc.source - c.start < MIN_CLIP) return [...clips.slice(0, loc.index), still, ...clips.slice(loc.index)];
  if (c.end - loc.source < MIN_CLIP) return [...clips.slice(0, loc.index + 1), still, ...clips.slice(loc.index + 1)];
  const split = splitAt(clips, editTime);
  return [...split.slice(0, loc.index + 1), still, ...split.slice(loc.index + 1)];
}
