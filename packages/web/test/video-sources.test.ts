import { describe, expect, it } from 'vitest';
import { createSourceFiles, kindOfFile, probeSource, type ProbeEnv } from '../src/video/sources.ts';

const f = (name: string, type: string) => new File(['x'], name, { type });

/** A stand-in element: setting `src` fires what a real one would, on the next turn. */
function fakeEnv(opts: { fire: 'loadedmetadata' | 'error' | 'never'; props?: Record<string, unknown> }) {
  const urls: string[] = [];
  const revoked: string[] = [];
  const env: ProbeEnv = {
    createObjectURL: () => {
      urls.push(`blob:${urls.length}`);
      return urls.at(-1)!;
    },
    revokeObjectURL: (u) => void revoked.push(u),
    timeoutMs: 30,
    createElement: () => {
      const el = Object.assign(new EventTarget(), { duration: 0, currentTime: 0, removeAttribute() {}, ...opts.props }) as unknown as HTMLVideoElement;
      let src = '';
      Object.defineProperty(el, 'src', {
        get: () => src,
        set: (v: string) => {
          src = v;
          if (opts.fire === 'never') return;
          setTimeout(() => {
            if (opts.fire === 'loadedmetadata') el.dispatchEvent(new Event('loadedmetadata'));
            else el.dispatchEvent(new Event('error'));
            // an image element reports through onload/onerror
            const img = el as unknown as { onload?: () => void; onerror?: () => void };
            (opts.fire === 'loadedmetadata' ? img.onload : img.onerror)?.();
          }, 0);
        },
      });
      return el;
    },
  };
  return { env, urls, revoked };
}

describe('kindOfFile', () => {
  it('knows pictures, videos and sounds by type, then by extension', () => {
    expect(kindOfFile(f('a.png', 'image/png'))).toBe('image');
    expect(kindOfFile(f('a.mp4', 'video/mp4'))).toBe('video');
    expect(kindOfFile(f('a.mp3', 'audio/mpeg'))).toBe('audio');
    expect(kindOfFile(f('a.WAV', ''))).toBe('audio');
    expect(kindOfFile(f('a.mov', ''))).toBe('video');
    expect(kindOfFile(f('a.txt', 'text/plain'))).toBeNull();
    expect(kindOfFile(f('a.bin', ''))).toBeNull();
  });
});

describe('probeSource', () => {
  it('reads a video: length and picture size', async () => {
    const { env, revoked, urls } = fakeEnv({ fire: 'loadedmetadata', props: { duration: 12.5, videoWidth: 1280, videoHeight: 720 } });
    const s = await probeSource(f('clip.mp4', 'video/mp4'), env, 's7');
    expect(s).toEqual({ id: 's7', kind: 'video', name: 'clip.mp4', duration: 12.5, w: 1280, h: 720 });
    expect(revoked).toEqual(urls); // the probe's own URL is let go
  });

  it('asks a video with an unknown length to find it (resolveDuration)', async () => {
    const { env } = fakeEnv({ fire: 'loadedmetadata', props: { duration: Infinity, videoWidth: 4, videoHeight: 3 } });
    const made = env.createElement;
    env.createElement = (tag) => {
      const el = made(tag) as HTMLVideoElement;
      let t = 0;
      Object.defineProperty(el, 'currentTime', {
        get: () => t,
        set: (v: number) => {
          t = v;
          if (v > 1e100) setTimeout(() => {
            (el as { duration: number }).duration = 8;
            el.dispatchEvent(new Event('durationchange'));
          }, 0);
        },
      });
      return el;
    };
    expect((await probeSource(f('rec.webm', 'video/webm'), env)).duration).toBe(8);
  });

  it('gives up on an Infinity-length video whose length is never found (timer keeps running)', async () => {
    const { env } = fakeEnv({ fire: 'loadedmetadata', props: { duration: Infinity } });
    await expect(probeSource(f('rec.webm', 'video/webm'), env)).rejects.toThrow('could not read "rec.webm" as a video');
  });

  it.each([['video', 'v.mp4', 'video/mp4', 'a video'], ['audio', 'a.mp3', 'audio/mpeg', 'a sound']])('rejects a %s with no usable length', async (_k, name, type) => {
    for (const duration of [0, NaN]) {
      const { env } = fakeEnv({ fire: 'loadedmetadata', props: { duration } });
      await expect(probeSource(f(name, type), env)).rejects.toThrow(`"${name}" has no usable length`);
    }
  });

  it('reads a sound: length only', async () => {
    const { env } = fakeEnv({ fire: 'loadedmetadata', props: { duration: 3.2 } });
    const s = await probeSource(f('song.mp3', 'audio/mpeg'), env);
    expect(s.kind).toBe('audio');
    expect(s.duration).toBe(3.2);
    expect(s.w).toBeUndefined();
  });

  it('reads a picture: natural size', async () => {
    const { env } = fakeEnv({ fire: 'loadedmetadata', props: { naturalWidth: 800, naturalHeight: 600 } });
    const s = await probeSource(f('p.png', 'image/png'), env);
    expect(s).toMatchObject({ kind: 'image', name: 'p.png', w: 800, h: 600 });
    expect(s.duration).toBeUndefined();
  });

  it('gives each source a fresh id when none is given', async () => {
    const { env } = fakeEnv({ fire: 'loadedmetadata', props: { naturalWidth: 1, naturalHeight: 1 } });
    const a = await probeSource(f('p.png', 'image/png'), env);
    const b = await probeSource(f('p.png', 'image/png'), env);
    expect(a.id).not.toBe(b.id);
  });

  it('refuses an unknown type with a readable message', async () => {
    await expect(probeSource(f('notes.txt', 'text/plain'), fakeEnv({ fire: 'never' }).env)).rejects.toThrow('"notes.txt" is not a picture, a video or a sound.');
  });

  it('says so when the browser cannot read the file, and still lets the URL go', async () => {
    const { env, revoked, urls } = fakeEnv({ fire: 'error' });
    await expect(probeSource(f('bad.mp4', 'video/mp4'), env)).rejects.toThrow('could not read "bad.mp4" as a video');
    await expect(probeSource(f('bad.png', 'image/png'), env)).rejects.toThrow('as a picture');
    expect(revoked).toEqual(urls);
  });

  it('gives up on a file that never answers', async () => {
    await expect(probeSource(f('stuck.mp4', 'video/mp4'), fakeEnv({ fire: 'never' }).env)).rejects.toThrow('could not read');
  });
});

describe('createSourceFiles', () => {
  const urlEnv = () => {
    const made: string[] = [];
    const revoked: string[] = [];
    return { made, revoked, createObjectURL: () => (made.push(`blob:${made.length}`), made.at(-1)!), revokeObjectURL: (u: string) => void revoked.push(u) };
  };

  it('hands out a URL per source, and null for an unknown one', () => {
    const env = urlEnv();
    const files = createSourceFiles(env);
    files.add('a', f('a.mp4', 'video/mp4'));
    expect(files.urlOf('a')).toBe('blob:0');
    expect(files.urlOf('nope')).toBeNull();
    expect(files.fileOf('a')!.name).toBe('a.mp4');
  });

  it('revokes a URL when its source is removed or replaced', () => {
    const env = urlEnv();
    const files = createSourceFiles(env);
    files.add('a', f('a.mp4', 'video/mp4'));
    files.add('a', f('a2.mp4', 'video/mp4'));
    expect(env.revoked).toEqual(['blob:0']);
    expect(files.urlOf('a')).toBe('blob:1');
    files.remove('a');
    expect(env.revoked).toEqual(['blob:0', 'blob:1']);
    expect(files.urlOf('a')).toBeNull();
    files.remove('a'); // removing twice is harmless
    expect(env.revoked).toHaveLength(2);
  });

  it('dispose revokes everything', () => {
    const env = urlEnv();
    const files = createSourceFiles(env);
    files.add('a', f('a.mp4', 'video/mp4'));
    files.add('b', f('b.png', 'image/png'));
    files.dispose();
    expect(env.revoked.sort()).toEqual(['blob:0', 'blob:1']);
    expect(files.has('a')).toBe(false);
  });
});
