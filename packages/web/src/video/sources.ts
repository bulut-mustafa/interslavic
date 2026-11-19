import type { SourceFiles } from './contracts.ts';
import { resolveDuration } from './duration.ts';
import { newSourceId, type Source, type SourceKind } from './project.ts';

/**
 * Reading what a file is (its kind, length and size) and holding the object
 * URLs the player shows the files from. Browser facts relied on are listed in
 * docs/ideas/video-research-library.md.
 */

const IMAGE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i;
const AUDIO = /\.(mp3|wav|m4a|aac|oga|ogg|opus|flac)$/i;

/** Picture, video or sound by the file's type, or by its extension when the browser gave none; null for anything else. */
export function kindOfFile(file: Pick<File, 'name' | 'type'>): SourceKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === '') return IMAGE.test(file.name) ? 'image' : VIDEO.test(file.name) ? 'video' : AUDIO.test(file.name) ? 'audio' : null;
  return null;
}

/** The pieces of the page that reading a file needs, so a test can supply stand-ins (jsdom cannot load media). */
export interface ProbeEnv {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createElement(tag: 'video' | 'audio' | 'img'): HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  /** How long a file has to show its metadata before it is given up on. */
  timeoutMs: number;
}

export const pageEnv: ProbeEnv = {
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  createElement: (tag) => document.createElement(tag),
  timeoutMs: 15_000,
};

const finite = (n: number): number | undefined => (Number.isFinite(n) && n > 0 ? n : undefined);

/**
 * Reads a file into a Source: the kind, and for a video its length and picture
 * size, for a picture its size, for a sound its length. Rejects with a message
 * fit to show when the file is not a picture, video or sound, or the browser
 * cannot read it.
 */
export async function probeSource(file: File, env: ProbeEnv = pageEnv, id: string = newSourceId()): Promise<Source> {
  const kind = kindOfFile(file);
  if (!kind) throw new Error(`"${file.name}" is not a picture, a video or a sound.`);
  const unreadable = new Error(`The browser could not read "${file.name}" as ${kind === 'image' ? 'a picture' : kind === 'video' ? 'a video' : 'a sound'}.`);
  const url = env.createObjectURL(file);
  try {
    const base = { id, kind, name: file.name };
    if (kind === 'image') {
      const img = env.createElement('img') as HTMLImageElement;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(unreadable), env.timeoutMs);
        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timer);
          reject(unreadable);
        };
        img.src = url;
      });
      return { ...base, w: finite(img.naturalWidth), h: finite(img.naturalHeight) };
    }
    const el = env.createElement(kind === 'video' ? 'video' : 'audio') as HTMLVideoElement | HTMLAudioElement;
    el.preload = 'metadata';
    const duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(unreadable), env.timeoutMs);
      const done = <T,>(f: (v: T) => void) => (v: T) => {
        clearTimeout(timer);
        f(v);
      };
      el.addEventListener('loadedmetadata', () => {
        // The timer keeps running until the length is known: an Infinity-length WebM may never report one.
        // NaN after loadedmetadata is not a length that can be found by seeking; only Infinity is.
        if (Number.isNaN(el.duration)) done(resolve)(NaN);
        else resolveDuration(el).then(done(resolve), done(reject));
      });
      el.addEventListener('error', () => {
        clearTimeout(timer);
        reject(unreadable);
      });
      el.src = url;
    });
    el.removeAttribute('src');
    if (finite(duration) === undefined) throw new Error(`"${file.name}" has no usable length, so it cannot be used as ${kind === 'video' ? 'a video' : 'a sound'}.`);
    if (kind === 'video') {
      const v = el as HTMLVideoElement;
      return { ...base, duration: finite(duration), w: finite(v.videoWidth), h: finite(v.videoHeight) };
    }
    return { ...base, duration: finite(duration) };
  } finally {
    env.revokeObjectURL(url);
  }
}

/** Where each source's file is shown from: one object URL per id, revoked when the file goes or the editor closes. */
export interface ManagedSourceFiles extends SourceFiles {
  /** Adds (or replaces) a file; a replaced file's old URL is revoked. */
  add(id: string, file: File): void;
  remove(id: string): void;
  has(id: string): boolean;
  fileOf(id: string): File | null;
  /** Revokes every URL. */
  dispose(): void;
}

export function createSourceFiles(env: Pick<ProbeEnv, 'createObjectURL' | 'revokeObjectURL'> = pageEnv): ManagedSourceFiles {
  const held = new Map<string, { file: File; url: string }>();
  const drop = (id: string) => {
    const old = held.get(id);
    if (old) env.revokeObjectURL(old.url);
    held.delete(id);
  };
  return {
    add(id, file) {
      drop(id);
      held.set(id, { file, url: env.createObjectURL(file) });
    },
    remove: drop,
    has: (id) => held.has(id),
    fileOf: (id) => held.get(id)?.file ?? null,
    urlOf: (id) => held.get(id)?.url ?? null,
    dispose() {
      for (const id of [...held.keys()]) drop(id);
    },
  };
}
