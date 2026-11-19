// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import VideoEditor from '../src/video/VideoEditor.tsx';
import { LibraryProvider, useLibrary, type OpenMode } from '../src/studio/library.tsx';
import { memoryVideoStore, type VideoRecord } from '../src/video/store.ts';
import { transports } from './video-fakes.ts';
import { screen } from './live-screen.ts';

vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : () => {}),
  set: () => true,
});

beforeEach(() => {
  transports.length = 0;
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
const picture = (name = 'logo.png') => new File(['x'], name, { type: 'image/png' });
const sound = (name = 'tune.mp3') => new File(['x'], name, { type: 'audio/mpeg' });

async function open(store: ReturnType<typeof memoryVideoStore> | null = null) {
  render(<VideoEditor store={store} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video()] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Video tools' })).toBeTruthy());
}
const addFile = async (file: File) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Add a video, picture or sound'), { target: { files: [file] } });
  });
};
/** Presses and releases on the timeline at a time (the zoom is 60 px a second), as a click does. jsdom has no layout, so the lanes are given a place. */
const pressTimelineAt = async (seconds: number) => {
  const lane = document.querySelector('.timeline-lanes')!;
  lane.getBoundingClientRect = () => ({ left: 0, width: 4000, top: 0, height: 200, right: 4000, bottom: 200, x: 0, y: 0, toJSON: () => {} });
  await act(async () => {
    lane.dispatchEvent(new MouseEvent('pointerdown', { clientX: seconds * 60, bubbles: true }));
    lane.dispatchEvent(new MouseEvent('pointerup', { clientX: seconds * 60, bubbles: true }));
  });
};
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const keys = (init: KeyboardEventInit) => fireEvent.keyDown(document.querySelector('.editor')!, init);
const wait = (ms = 700) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const textBox = () => screen.getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement;
const clips = () => screen.getAllByRole('button', { name: /^Clip \d/ });
const saved = (m: ReturnType<typeof memoryVideoStore>) => m.data.get('video:record') as VideoRecord;

describe('the video editor', () => {
  it('starts with only the place to open a video, and says the video stays on the device', () => {
    render(<VideoEditor store={null} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.body.textContent).toContain('stay on your device');
  });

  it('makes room once a video is open: the explainer and the big upload box go, a small add-file control stays', async () => {
    render(<VideoEditor store={null} />);
    expect(document.querySelector('.dropzone')).toBeTruthy();
    expect(document.querySelector('.lesson-summary')).toBeTruthy();
    cleanup();
    await open();
    expect(document.querySelector('.lesson-summary')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Video editor' })).toBeNull();
    expect(screen.getByLabelText('Add a video, picture or sound')).toBeTruthy();
    expect(screen.queryByText('Open another')).toBeNull();
    expect(document.querySelector('.dropzone')).toBeNull();
    expect(screen.getByLabelText('Subtitles to add as text (.srt)')).toBeTruthy();
  });

  it('opens a video as one clip, scaled to the working size', async () => {
    await open();
    expect(clips()).toHaveLength(1);
    expect(clips()[0]!.getAttribute('aria-label')).toBe('Clip 1, 1:00');
    expect(screen.getByText(/0:00\.0 \/ 1:00\.0/)).toBeTruthy();
    const canvas = document.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([1280, 720]); // 1920x1080 scaled to fit 1280
    expect(transports).toHaveLength(1); // the player exists once there is something to play
  });

  it('splits the clip at the playhead, then deletes and undoes', async () => {
    await open();
    await pressTimelineAt(30);
    expect(screen.getByText(/0:30\.0 \/ 1:00\.0/)).toBeTruthy();
    await click('Split at playhead');
    expect(clips()).toHaveLength(2);
    expect(clips()[0]!.getAttribute('aria-label')).toBe('Clip 1, 0:30');

    await click(/^Clip 2/);
    await click('Delete');
    expect(clips()).toHaveLength(1);
    await click('Undo');
    expect(clips()).toHaveLength(2);
  });

  it('keeps the player in step with the edit: after cutting the start, the edit is shorter and the player is told', async () => {
    await open();
    await pressTimelineAt(30);
    await click('Split at playhead');
    await click(/^Clip 1/);
    const before = transports[0]!.resyncs;
    await click('Delete');
    expect(screen.getByText(/0:00\.0 \/ 0:30\.0/)).toBeTruthy();
    expect(transports[0]!.resyncs).toBeGreaterThan(before);
    expect(transports[0]!.seeks.at(-1)).toBe(0); // the playhead went back to the start, which is now the second half
  });

  it('will not delete the last clip', async () => {
    await open();
    await click(/^Clip 1/);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('trims the selected clip from its settings, without touching the original', async () => {
    await open();
    await click(/^Clip 1/);
    fireEvent.change(screen.getByLabelText('Clip ends at (seconds)'), { target: { value: '20' } });
    expect(screen.getByText(/0:00\.0 \/ 0:20\.0/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Clip ends at (seconds)'), { target: { value: '45' } });
    expect(screen.getByText(/0:00\.0 \/ 0:45\.0/)).toBeTruthy(); // trimmed material comes back
  });

  it('adds text at the playhead, shown for three seconds, and edits it', async () => {
    await open();
    await click('Add text');
    expect(textBox().value).toBe('Your text');
    expect((screen.getByLabelText('Shown from (seconds)') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Shown until (seconds)') as HTMLInputElement).value).toBe('3');
    fireEvent.change(textBox(), { target: { value: 'Dobry denj' } });
    expect(screen.getByRole('button', { name: /^Text: Dobry denj/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Shown until (seconds)'), { target: { value: '8' } });
    expect((screen.getByLabelText('Shown until (seconds)') as HTMLInputElement).value).toBe('8');
  });

  it('never lets the end of a text come before its start', async () => {
    await open();
    await click('Add text');
    fireEvent.change(screen.getByLabelText('Shown until (seconds)'), { target: { value: '0' } });
    expect(Number((screen.getByLabelText('Shown until (seconds)') as HTMLInputElement).value)).toBeGreaterThanOrEqual(0.1);
  });

  it('applies a style preset', async () => {
    await open();
    await click('Add text');
    await click('Neon');
    expect((screen.getByLabelText('Glow') as HTMLInputElement).checked).toBe(true);
  });

  it('translates the text into Interslavic and brings the original back', async () => {
    const calls: string[][] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      const { lines } = JSON.parse(init.body) as { lines: string[] };
      calls.push(lines);
      return { ok: true, status: 200, json: async () => ({ results: lines.map((l) => ({ text: `ISV ${l}`, flagged: false, reasons: [] })) }) };
    }));
    await open();
    await click('Add text');
    fireEvent.change(textBox(), { target: { value: 'Good morning' } });
    await click('Translate all text to Interslavic');
    expect(calls).toEqual([['Good morning']]);
    expect(textBox().value).toBe('ISV Good morning');
    await click('Restore original');
    expect(textBox().value).toBe('Good morning');
  });

  it('adds subtitles from an .srt as timed text, and says how many', async () => {
    await open();
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nDobry denj.\n\n2\n00:00:05,000 --> 00:00:06,000\nHvala.\n';
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Subtitles to add as text (.srt)'), { target: { files: [new File([srt], 's.srt')] } });
    });
    await waitFor(() => expect(screen.getByText(/Added 2 subtitles as text on the video/)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(2);
  });

  it('says so when a file holds no subtitles', async () => {
    await open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Subtitles to add as text (.srt)'), { target: { files: [new File(['nothing'], 's.srt')] } });
    });
    await waitFor(() => expect(screen.getByText('No subtitles were found in that file.')).toBeTruthy());
  });

  it('cannot save while there is nothing to record in this browser, and says why', async () => {
    await open();
    await click('Save video');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot record video'));
  });

  it('shows a message when the video cannot be read', async () => {
    render(<VideoEditor store={null} />);
    fireEvent.change(screen.getByLabelText('Video to edit'), { target: { files: [video('bad.mp4')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not read'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('refuses a file that is not a video', () => {
    render(<VideoEditor store={null} />);
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [picture('a.png')] } });
    expect(screen.getByRole('alert').textContent).toBe('That file is not a video.');
  });
});

describe('the video editor with several files', () => {
  it('adds a second video after the first, as a new clip, and goes to where it starts', async () => {
    await open();
    await addFile(video('second.mp4'));
    expect(clips().map((c) => c.getAttribute('aria-label'))).toEqual(['Clip 1, 1:00', 'Clip 2, 1:00']);
    expect(screen.getByText(/1:00\.0 \/ 2:00\.0/)).toBeTruthy();
  });

  it('adds a picture over the video at the playhead, on a lane of its own', async () => {
    const m = memoryVideoStore();
    await open(m);
    await click('Add text'); // takes the first lane
    await pressTimelineAt(30);
    await addFile(picture());
    const pic = screen.getByRole('button', { name: 'Picture: logo.png' });
    const txt = screen.getByRole('button', { name: /^Text:/ });
    expect(pic.closest('[role=group]')).not.toBe(txt.closest('[role=group]'));
    expect(screen.getByText(/0:30\.0 \/ 1:00\.0/)).toBeTruthy();
    await wait();
    const layers = saved(m).hist.present.layers;
    const media = layers.find((l) => (l as { kind?: string }).kind === 'media') as { start: number; end: number; track: number; w: number; h: number };
    expect(media.start).toBe(30);
    expect(media.end).toBe(35); // a picture shows for five seconds
    expect(media.track).toBe(1);
    expect(media.w).toBeLessThanOrEqual(640); // about half the 1280 frame, scaled to fit
    expect(saved(m).hist.present.sources.map((s) => s.kind)).toEqual(['video', 'image']);
  });

  it('adds a sound as a sound layer at the playhead', async () => {
    const m = memoryVideoStore();
    await open(m);
    await pressTimelineAt(10);
    await addFile(sound());
    expect(screen.getByRole('button', { name: 'Sound: tune.mp3' })).toBeTruthy();
    expect(screen.getByLabelText('Volume')).toBeTruthy(); // the new sound is selected
    await wait();
    const a = saved(m).hist.present.layers[0] as { kind: string; start: number; end: number };
    expect([a.kind, a.start, a.end]).toEqual(['audio', 10, 40]);
  });

  it('says so when a file added is not a picture, a video or a sound, and keeps the edit', async () => {
    await open();
    await addFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert').textContent).toContain('is not a video, picture or sound');
    expect(clips()).toHaveLength(1);
  });

  it('removes the selected layer with the Delete key, and undoes with Cmd+Z', async () => {
    await open();
    await click('Add text');
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1);
    keys({ key: 'Delete' });
    expect(screen.queryAllByRole('button', { name: /^Text:/ })).toHaveLength(0);
    keys({ key: 'z', metaKey: true });
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1);
    keys({ key: 'z', metaKey: true });
    expect(screen.queryAllByRole('button', { name: /^Text:/ })).toHaveLength(0); // back before the text was added
    keys({ key: 'z', metaKey: true, shiftKey: true });
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1); // Cmd+Shift+Z redoes
  });

  it('does not remove the last clip with the Delete key', async () => {
    await open();
    await click(/^Clip 1/);
    keys({ key: 'Delete' });
    expect(clips()).toHaveLength(1);
  });

  it('turns the original sound off and sets the volume', async () => {
    await open();
    transports[0]!.volumes.length = 0;
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '50' } });
    expect(transports[0]!.volumes.at(-1)).toBe(0.5);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Sound is on' }));
    });
    expect(screen.getByText('Sound is off')).toBeTruthy();
    expect(transports[0]!.volumes.at(-1)).toBe(0);
  });
});

/** Stands in for the Uploads sheet: sends a file to the editor the way a click there does. */
let sendFile: (file: File, mode?: OpenMode) => void = () => {};
function Sender() {
  const lib = useLibrary();
  sendFile = (file, mode) => lib.open(lib.add([file])[0]!, mode ? { mode } : undefined);
  return null;
}
const withLibrary = () =>
  render(
    <LibraryProvider path="/studio/video">
      <VideoEditor store={null} />
      <Sender />
    </LibraryProvider>,
  );
const send = async (file: File, mode?: OpenMode) => {
  await act(async () => sendFile(file, mode));
};

describe('the video editor, with files sent from the Uploads sheet', () => {
  it('opens a video sent to an empty editor, with no question', async () => {
    withLibrary();
    await send(video());
    await waitFor(() => expect(clips()).toHaveLength(1));
  });

  it('asks before a video replaces an edit; keeping editing leaves everything as it was', async () => {
    withLibrary();
    await send(video());
    await waitFor(() => expect(clips()).toHaveLength(1));
    await click('Add text');
    await send(video('other.mp4'));
    expect(screen.getByRole('alertdialog', { name: 'Replace the video?' }).textContent).toContain('other.mp4');
    await click('Keep editing');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1);
  });

  it('starts over with the new video when told to', async () => {
    withLibrary();
    await send(video());
    await waitFor(() => expect(clips()).toHaveLength(1));
    await click('Add text');
    await send(video('other.mp4'));
    await click('Open it');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryAllByRole('button', { name: /^Text:/ })).toHaveLength(0);
    expect(document.querySelector('.editor-file')!.textContent).toBe('other.mp4');
  });

  it('adds a video sent to be appended, and a picture sent as an overlay, without asking', async () => {
    withLibrary();
    await send(video());
    await waitFor(() => expect(clips()).toHaveLength(1));
    await click('Add text');
    await send(video('more.mp4'), 'append');
    expect(clips()).toHaveLength(2);
    await send(picture(), 'overlay');
    expect(screen.getByRole('button', { name: 'Picture: logo.png' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
