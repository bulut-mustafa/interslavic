import { vi } from 'vitest';
import type { Transport, TransportOptions } from '../src/video/contracts.ts';
import type { Source } from '../src/video/project.ts';

/**
 * Stand-ins for what jsdom cannot do (read a media file, play it), shared by the
 * video editor tests. Used through vi.mock in each test file:
 *
 *   vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
 *   vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
 *   vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));
 */

/** What a file name stands for: .mp4 a 60 s 1920x1080 video, .png an 800x600 picture, .mp3 a 30 s sound; "bad" files cannot be read. */
export function sourceOfName(file: File, id: string): Source {
  const name = file.name;
  if (name.startsWith('bad')) throw new Error(`The browser could not read "${name}" as a video.`);
  if (/\.(png|jpe?g)$/i.test(name)) return { id, kind: 'image', name, w: 800, h: 600 };
  if (/\.mp3$/i.test(name)) return { id, kind: 'audio', name, duration: 30 };
  if (/\.mp4$/i.test(name)) return { id, kind: 'video', name, duration: 60, w: 1920, h: 1080 };
  throw new Error(`"${name}" is not a picture, a video or a sound.`);
}

let ids = 0;
export const fakeSources = (orig: object) => ({
  ...orig,
  probeSource: async (file: File, _env?: unknown, id?: string): Promise<Source> => sourceOfName(file, id ?? `s${++ids}`),
});

export const fakeFrames = (orig: object) => ({
  ...orig,
  grabStrip: async (srcId: string) => ({ srcId, frames: [] }),
});

export interface FakeTransport extends Transport {
  seeks: number[];
  resyncs: number;
  volumes: number[];
  options: TransportOptions;
  disposed: boolean;
  /** Pretend a frame came from the player. */
  frame(): void;
}

/** Every transport the editor made, newest last. */
export const transports: FakeTransport[] = [];

export function makeFakeTransport(options: TransportOptions): FakeTransport {
  let time = 0;
  let playing = false;
  const t: FakeTransport = {
    seeks: [],
    resyncs: 0,
    volumes: [],
    options,
    disposed: false,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    seek(v) {
      time = v;
      t.seeks.push(v);
    },
    async play() {
      playing = true;
    },
    pause() {
      playing = false;
    },
    resync() {
      t.resyncs++;
    },
    setMasterVolume(v) {
      t.volumes.push(v);
    },
    dispose() {
      t.disposed = true;
    },
    picture: () => null,
    frame: () => options.hooks.onFrame(),
  };
  transports.push(t);
  return t;
}

export const fakeTransportModule = (orig: object) => ({
  ...orig,
  createTransport: vi.fn((o: TransportOptions) => makeFakeTransport(o)),
});
