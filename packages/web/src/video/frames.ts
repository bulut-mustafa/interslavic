/**
 * Little pictures from along a video, for the timeline, so a clip can be
 * recognised by what it shows instead of by a number.
 */

import type { FrameStrip } from './contracts.ts';
import type { SourceKind } from './project.ts';

export interface Frame {
  /** Where in the original video, in seconds. */
  t: number;
  url: string;
}

/** The moments to take pictures at: the middles of `count` equal parts of the video. */
export function frameTimes(duration: number, count: number): number[] {
  if (!(duration > 0) || count < 1) return [];
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration);
}

/** How many pictures to take: one every couple of seconds of a short video, never fewer than 8 or more than 30. */
export const frameCount = (duration: number): number => Math.min(30, Math.max(8, Math.round(duration / 2)));

export function nearestFrame(frames: Frame[], t: number): Frame | undefined {
  let best: Frame | undefined;
  for (const f of frames) if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  return best;
}

/** The pictures to show along a clip that plays `start` to `end` of the original: `tiles` of them, each the nearest to its stretch. */
export function clipTiles(frames: Frame[], start: number, end: number, tiles: number): string[] {
  if (frames.length === 0 || tiles < 1 || end <= start) return [];
  return Array.from({ length: tiles }, (_, k) => nearestFrame(frames, start + ((k + 0.5) / tiles) * (end - start))!.url);
}

/** `clipTiles` for a strip from the contracts (its pictures say `time`, not `t`). */
export function stripTiles(strip: FrameStrip | undefined, start: number, end: number, tiles: number): string[] {
  if (!strip) return [];
  return clipTiles(
    strip.frames.map((f) => ({ t: f.time, url: f.url })),
    start,
    end,
    tiles,
  );
}

/**
 * `stripTiles` remembered per clip: the same array comes back while the strip,
 * the range and the count are unchanged, so a timeline that redraws every
 * frame of playback neither recomputes nor re-renders the pictures.
 */
export function makeTileCache(): (id: string, strip: FrameStrip | undefined, start: number, end: number, tiles: number) => string[] {
  const seen = new Map<string, { strip: FrameStrip | undefined; start: number; end: number; tiles: number; out: string[] }>();
  return (id, strip, start, end, tiles) => {
    const hit = seen.get(id);
    if (hit && hit.strip === strip && hit.start === start && hit.end === end && hit.tiles === tiles) return hit.out;
    const out = stripTiles(strip, start, end, tiles);
    seen.set(id, { strip, start, end, tiles, out });
    return out;
  };
}

/** The duration to take pictures over: the one the project knows, else what the video itself reports once loaded (a source added a moment ago may not have been measured yet), else 0. */
export const usableDuration = (given: number | undefined, reported: number): number =>
  given !== undefined && given > 0 ? given : Number.isFinite(reported) && reported > 0 ? reported : 0;

/** The one picture of a strip nearest a source moment, or undefined (sounds have none). */
export const stripPicture = (strip: FrameStrip | undefined, time: number): string | undefined => stripTiles(strip, time, time + 1e-6, 1)[0];

/** The little picture of a still image: the whole image, scaled down. Never throws. */
async function grabImage(src: string, signal?: AbortSignal): Promise<Frame[]> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return [];
  const img = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = src;
  });
  if (!loaded || signal?.aborted) return [];
  try {
    const w = 112;
    const h = Math.max(1, Math.round((w * (img.naturalHeight || 9)) / (img.naturalWidth || 16)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    return [{ t: 0, url: c.toDataURL('image/jpeg', 0.55) }];
  } catch {
    return [];
  }
}

/**
 * The strip of pictures for one source: many along a video, one for an image,
 * none for a sound. Never throws; gives what it has when stopped.
 */
export async function grabStrip(srcId: string, url: string, duration: number, signal?: AbortSignal, kind: SourceKind = 'video'): Promise<FrameStrip> {
  if (kind === 'audio') return { srcId, frames: [] };
  const frames = kind === 'image' ? await grabImage(url, signal) : await grabFrames(url, duration, signal);
  return { srcId, frames: frames.map((f) => ({ time: f.t, url: f.url })) };
}

/**
 * Takes the pictures, one after another, from a second copy of the video so the
 * one being edited is not disturbed. Gives back what it has when stopped or when
 * the browser cannot seek; never throws.
 */
export async function grabFrames(src: string, duration: number, signal?: AbortSignal): Promise<Frame[]> {
  const out: Frame[] = [];
  if (typeof document === 'undefined') return out;
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  const ready = (event: string, ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      v.addEventListener(
        event,
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
    });
  try {
    v.src = src;
    if (!(await ready('loadeddata', 8000))) return out;
    const w = 112;
    const h = Math.max(1, Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return out;
    const span = usableDuration(duration, v.duration);
    for (const t of frameTimes(span, frameCount(span))) {
      if (signal?.aborted) break;
      const seeked = ready('seeked', 4000);
      v.currentTime = t;
      if (!(await seeked)) continue;
      ctx.drawImage(v, 0, 0, w, h);
      out.push({ t, url: c.toDataURL('image/jpeg', 0.55) });
    }
  } catch {
    /* thumbnails are a nicety: the timeline works without them */
  } finally {
    v.removeAttribute('src');
    v.load?.();
  }
  return out;
}
