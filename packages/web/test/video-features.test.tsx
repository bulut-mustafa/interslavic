// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import VideoEditor from '../src/video/VideoEditor.tsx';
import { LibraryProvider, useLibrary } from '../src/studio/library.tsx';
import type { Transcriber } from '../src/transcribe/client.ts';
import { SAMPLE_RATE } from '../src/transcribe/client.ts';
import { memoryVideoStore, sourceKey, type MemoryVideoStore, type VideoRecord } from '../src/video/store.ts';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import type { Source, VideoProject } from '../src/video/project.ts';
import { screen } from './live-screen.ts';

vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : () => {}),
  set: () => true,
});

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const video = (name = 'talk.mp4') => new File(['x'], name, { type: 'video/mp4' });
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const toolbar = () => waitFor(() => expect(screen.getByRole('toolbar', { name: 'Video tools' })).toBeTruthy());
const wait = (ms = 700) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const fakeTranscriber = (log: string[] = []): Transcriber => ({
  load: async (repo, onProgress) => {
    log.push(`load ${repo}`);
    onProgress({ fraction: 1, file: 'x' });
  },
  transcribe: async () => [
    { text: ' Welcome to our shop. ', timestamp: [1, 3] },
    { text: 'We open every day.', timestamp: [4, 6] },
  ],
  dispose: () => void log.push('dispose'),
});
const decode = async () => ({ samples: new Float32Array(SAMPLE_RATE * 10), seconds: 60 });

describe('captions from the speech, inside the video editor', () => {
  async function ready(log: string[] = []) {
    render(<VideoEditor store={null} makeTranscriber={() => fakeTranscriber(log)} decodeAudio={decode} />);
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
  }

  it('asks first, saying the speech is not uploaded and that a model is downloaded once', async () => {
    await ready();
    await click('Make captions from the speech');
    const ask = screen.getByRole('dialog', { name: 'Make captions' });
    expect(ask.textContent).toContain('on your device');
    expect(ask.textContent).toContain('nothing is uploaded');
    expect(ask.textContent).toContain('downloads a speech model');
    await click('Not now');
    expect(screen.queryByRole('dialog', { name: 'Make captions' })).toBeNull();
  });

  it('puts the speech on the video as text, timed to the original, with the chosen model and language', async () => {
    const log: string[] = [];
    await ready(log);
    await click('Make captions from the speech');
    fireEvent.change(screen.getByLabelText('Speech model'), { target: { value: 'base' } });
    await click('Make captions');
    await waitFor(() => expect(screen.getByText(/Added 2 captions from the speech/)).toBeTruthy());
    expect(log[0]).toBe('load onnx-community/whisper-base');
    expect(log.at(-1)).toBe('dispose');
    expect(screen.getByRole('button', { name: /^Text: Welcome to our shop\./ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text: We open every day\./ })).toBeTruthy();
  });

  it('says plainly when no speech was found', async () => {
    render(
      <VideoEditor
        store={null}
        makeTranscriber={() => ({ ...fakeTranscriber(), transcribe: async () => [] })}
        decodeAudio={decode}
      />,
    );
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
    await click('Make captions from the speech');
    await click('Make captions');
    await waitFor(() => expect(screen.getByText(/No speech was found/)).toBeTruthy());
  });

  it('shows why it stopped, without losing the edit', async () => {
    render(<VideoEditor store={null} makeTranscriber={fakeTranscriber} decodeAudio={async () => { throw new Error('The browser could not read the sound in this file.'); }} />);
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
    await click('Make captions from the speech');
    await click('Make captions');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not read the sound'));
    expect(screen.getByRole('toolbar', { name: 'Video tools' })).toBeTruthy();
  });
});


// ---- keeping the project ----

const talk: Source = { id: 's1', kind: 'video', name: 'talk.mp4', duration: 60, w: 1920, h: 1080 };
const projectOf = (over: Partial<VideoProject> = {}): VideoProject => ({
  sources: [talk],
  clips: [{ id: 'c1', srcId: 's1', start: 0, end: 60 }],
  layers: [],
  frame: null,
  background: '#000000',
  ...over,
});
const record = (hist: H.History<VideoProject>, over: Partial<VideoRecord> = {}): VideoRecord => ({ version: 2, hist, lang: 'en', script: 'standard', muted: false, ...over });
const sourceKeys = (m: MemoryVideoStore) => [...m.data.keys()].filter((k) => k.startsWith('video:src:'));
const recordOf = (m: MemoryVideoStore) => m.data.get('video:record') as VideoRecord | undefined;

/** A store that already holds the project and its video, as a visit leaves it. */
function seeded(hist: H.History<VideoProject>, over: Partial<VideoRecord> = {}) {
  const m = memoryVideoStore();
  m.data.set('video:record', record(hist, over));
  m.data.set(sourceKey('s1'), video());
  return m;
}
const savedHistory = () => {
  const layer = newLayer({ x: 10, y: 10, text: 'Zdravo', start: 1, end: 3 });
  const cut = projectOf({ clips: [{ id: 'c1', srcId: 's1', start: 0, end: 30 }], layers: [layer] });
  return H.push(H.start(projectOf()), cut);
};

/** Sends files to the editor the way the Uploads sheet does. */
let sendFile: (file: File) => void = () => {};
function Sender() {
  const lib = useLibrary();
  sendFile = (file) => lib.open(lib.add([file])[0]!);
  return null;
}

describe('keeping the video project on this device', () => {
  it('keeps the video, and then the edit as it changes', async () => {
    const m = memoryVideoStore();
    render(<VideoEditor store={m} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
    await wait();
    expect(sourceKeys(m)).toHaveLength(1);
    expect((m.data.get(sourceKeys(m)[0]!) as File).name).toBe('talk.mp4');
    expect(recordOf(m)?.version).toBe(2);
    expect(recordOf(m)?.hist.present.clips).toHaveLength(1);
    await click('Add text');
    await wait();
    expect(recordOf(m)?.hist.present.layers).toHaveLength(1);
    expect(recordOf(m)?.hist.past).toHaveLength(1);
    expect(screen.getByText('Kept on this device')).toBeTruthy();
  });

  it('keeps every file added, not only the first video', async () => {
    const m = memoryVideoStore();
    render(<VideoEditor store={m} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a video, picture or sound'), { target: { files: [video('second.mp4'), new File(['x'], 'logo.png', { type: 'image/png' })] } });
    });
    await wait();
    expect(sourceKeys(m)).toHaveLength(3);
    expect(recordOf(m)?.hist.present.sources.map((s) => s.name)).toEqual(['talk.mp4', 'second.mp4', 'logo.png']);
  });

  it('brings the project back next time: the video, its cuts, its text and its undo steps', async () => {
    const m = seeded(savedHistory(), { lang: 'ru', script: 'cyrillic', muted: true });
    render(<VideoEditor store={m} />);
    expect(screen.getByText('Getting your video back…')).toBeTruthy();
    await toolbar();
    expect(screen.getByText(/0:00\.0 \/ 0:30\.0/)).toBeTruthy(); // the cut came back
    expect(screen.getByRole('button', { name: /^Text: Zdravo/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Language of the text') as HTMLSelectElement).value).toBe('ru');
    expect(screen.getByRole('switch', { name: 'Sound is off' })).toBeTruthy(); // the sound setting came back too
    await click('Undo');
    expect(screen.getByText(/0:00\.0 \/ 1:00\.0/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Text:/ })).toBeNull();
  });

  it('brings back a project saved by the one-video editor as a project of the new kind, with its undo steps, and saves it as one', async () => {
    const layer = newLayer({ x: 10, y: 10, text: 'Zdravo', start: 1, end: 3 });
    const v1 = H.push(H.start({ clips: [{ id: 'c1', start: 0, end: 60 }], layers: [] }), { clips: [{ id: 'c1', start: 0, end: 30 }], layers: [layer] });
    const m = memoryVideoStore();
    m.data.set('video:record', { name: 'talk.mp4', hist: v1, lang: 'ru', script: 'cyrillic', muted: true });
    m.data.set('video:file', video());
    render(<VideoEditor store={m} />);
    await toolbar();
    expect(screen.getByText(/0:00\.0 \/ 0:30\.0/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text: Zdravo/ })).toBeTruthy();
    expect(document.querySelector('.editor-file')!.textContent).toBe('talk.mp4');
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
    await click('Undo'); // the step before the cut is intact
    expect(screen.getByText(/0:00\.0 \/ 1:00\.0/)).toBeTruthy();
    await wait();
    const r = recordOf(m)!;
    expect(r.version).toBe(2);
    expect(r.hist.present.sources.map((s) => [s.id, s.name])).toEqual([['s0', 'talk.mp4']]);
    expect(r.hist.future).toHaveLength(1);
    expect(r.lang).toBe('ru');
  });

  it('still has the video of a one-video project the next time it is loaded after the upgrade', async () => {
    const v1 = H.start({ clips: [{ id: 'c1', start: 0, end: 60 }], layers: [] });
    const m = memoryVideoStore();
    m.data.set('video:record', { name: 'talk.mp4', hist: v1, lang: 'en', script: 'standard' });
    m.data.set('video:file', video());
    render(<VideoEditor store={m} />);
    await toolbar();
    await click('Add text');
    await wait();
    expect(recordOf(m)?.version).toBe(2);
    const again = await m.load();
    expect(again?.missing).toEqual([]);
  });

  it('says so, and keeps the project, when a file the edit uses is gone from this device', async () => {
    const m = seeded(savedHistory());
    m.data.delete(sourceKey('s1'));
    render(<VideoEditor store={m} />);
    await toolbar();
    expect(screen.getByRole('alert').textContent).toContain('could not be found on this device');
    expect(clips()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Text: Zdravo/ })).toBeTruthy();
  });

  it('forgets the old edit when a different video is opened', async () => {
    const m = seeded(savedHistory());
    render(
      <LibraryProvider path="/studio/video">
        <VideoEditor store={m} />
        <Sender />
      </LibraryProvider>,
    );
    await toolbar();
    await act(async () => sendFile(video('other.mp4')));
    await click('Open it');
    await wait(50);
    expect(sourceKeys(m)).toHaveLength(1);
    expect((m.data.get(sourceKeys(m)[0]!) as File).name).toBe('other.mp4');
    expect(m.data.has('video:record')).toBe(false); // nothing of the old edit is left to be mixed with the new video
  });

  it('says so when the browser will not keep a big video, instead of pretending', async () => {
    const m = memoryVideoStore();
    m.fail.on = true;
    render(<VideoEditor store={m} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
    await toolbar();
    await wait();
    expect(screen.getByRole('alert').textContent).toContain('Could not keep this video');
  });

  it('starts empty, and says why, when the saved video cannot be read', async () => {
    const m = memoryVideoStore();
    m.load = async () => {
      throw new Error('StorageTimeout');
    };
    render(<VideoEditor store={m} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be read'));
    expect(screen.getByLabelText('Video to edit')).toBeTruthy();
  });
});

const clips = () => screen.getAllByRole('button', { name: /^Clip \d/ });
