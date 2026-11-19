// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import VideoEditor from '../src/video/VideoEditor.tsx';
import { ActiveContext } from '../src/studio/active.tsx';
import { LibraryProvider, useLibrary } from '../src/studio/library.tsx';
import { memoryVideoStore, sourceKey, type MemoryVideoStore, type VideoRecord } from '../src/video/store.ts';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { SAMPLE_RATE } from '../src/transcribe/client.ts';
import type { Transcriber } from '../src/transcribe/client.ts';
import { TRANSITION_KINDS } from '../src/video/transitions.ts';
import type { AudioLayer, Layer, MediaLayer, Source, VideoProject } from '../src/video/project.ts';
import { isAudio, isMedia, isText } from '../src/video/project.ts';
import { transports } from './video-fakes.ts';
import { screen } from './live-screen.ts';

const mocks = vi.hoisted(() => ({ exportVideo: vi.fn(), freezeFrame: vi.fn(), downloadBlob: vi.fn() }));

vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));
vi.mock('../src/video/export.ts', async (orig) => ({ ...(await orig<object>()), exportVideo: mocks.exportVideo }));
vi.mock('../src/video/freeze.ts', async (orig) => ({ ...(await orig<object>()), freezeFrame: mocks.freezeFrame }));
vi.mock('../src/download.ts', async (orig) => ({ ...(await orig<object>()), downloadBlob: mocks.downloadBlob }));

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : () => {}),
  set: () => true,
});

beforeEach(() => {
  transports.length = 0;
  mocks.exportVideo.mockReset();
  mocks.freezeFrame.mockReset();
  mocks.downloadBlob.mockReset();
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---- projects and a way to open them ----

const V1: Source = { id: 'src1', kind: 'video', name: 'talk.mp4', duration: 60, w: 1920, h: 1080 };
const V2: Source = { id: 'src4', kind: 'video', name: 'b.mp4', duration: 60, w: 1920, h: 1080 };
const img = (id: string, name: string): Source => ({ id, kind: 'image', name, w: 800, h: 600 });
const A = img('src2', 'a.png');
const B = img('src5', 'b.png');
const C = img('src6', 'c.png');
const SND: Source = { id: 'src3', kind: 'audio', name: 'tune.mp3', duration: 30 };

const proj = (over: Partial<VideoProject> = {}): VideoProject => ({
  sources: [V1],
  clips: [{ id: 'c1', srcId: 'src1', start: 0, end: 60 }],
  layers: [],
  frame: null,
  background: '#000000',
  ...over,
});
const media = (id: string, srcId: string, track: number, over: Partial<MediaLayer> = {}): MediaLayer => ({
  id, kind: 'media', srcId, in: 0, start: 0, end: 5, track, x: 100, y: 100, w: 200, h: 150, rotation: 0, opacity: 1, blend: 'normal', ...over,
});
const sound = (id: string, track: number, over: Partial<AudioLayer> = {}): AudioLayer => ({ id, kind: 'audio', srcId: 'src3', in: 0, start: 0, end: 30, track, ...over });
const three = (): VideoProject => proj({ sources: [V1, A, B, C], layers: [media('pa', 'src2', 0), media('pb', 'src5', 1), media('pc', 'src6', 2)] });

const fileOf = (s: Source) => new File(['x'], s.name, { type: s.kind === 'video' ? 'video/mp4' : s.kind === 'image' ? 'image/png' : 'audio/mpeg' });
const record = (hist: H.History<VideoProject>, over: Partial<VideoRecord> = {}): VideoRecord => ({ version: 2, hist, lang: 'en', script: 'standard', muted: false, ...over });

/** A store already holding an edit and the file of every source any step of it uses, as a visit leaves it. */
function seeded(from: VideoProject | H.History<VideoProject>, over: Partial<VideoRecord> = {}): MemoryVideoStore {
  const hist = 'present' in from ? from : H.start(from);
  const m = memoryVideoStore();
  m.data.set('video:record', record(hist, over));
  for (const p of [...hist.past, hist.present, ...hist.future]) for (const s of p.sources) m.data.set(sourceKey(s.id), fileOf(s));
  return m;
}

const toolbar = () => waitFor(() => expect(screen.getByRole('toolbar', { name: 'Video tools' })).toBeTruthy());
/** Opens an edit the way a visit does: restored from the store. */
async function mount(from: VideoProject | H.History<VideoProject>, o: { active?: boolean; store?: MemoryVideoStore; props?: Record<string, unknown> } = {}) {
  const m = o.store ?? seeded(from);
  const tree = (active: boolean) => (
    <ActiveContext.Provider value={active}>
      <VideoEditor store={m} {...(o.props ?? {})} />
    </ActiveContext.Provider>
  );
  const r = render(tree(o.active ?? true));
  await toolbar();
  return { m, setActive: (a: boolean) => r.rerender(tree(a)) };
}

const saved = (m: MemoryVideoStore) => m.data.get('video:record') as VideoRecord;
/** The saved history once it satisfies `ok` (the edit is kept 500 ms after the last change). */
async function kept(m: MemoryVideoStore, ok: (h: H.History<VideoProject>) => boolean): Promise<H.History<VideoProject>> {
  await waitFor(() => expect(ok(saved(m).hist)).toBe(true), { timeout: 3000 });
  return saved(m).hist;
}
const layerOf = (p: VideoProject, id: string) => p.layers.find((l) => l.id === id)!;

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const bar = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const clips = () => screen.getAllByRole('button', { name: /^Clip \d/ });
const undoButton = () => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
/** Presses and releases on the timeline at a time (60 px a second), as a click does. */
const pressTimelineAt = async (seconds: number) => {
  const lane = document.querySelector('.timeline-lanes')!;
  lane.getBoundingClientRect = () => ({ left: 0, width: 4000, top: 0, height: 200, right: 4000, bottom: 200, x: 0, y: 0, toJSON: () => {} });
  await act(async () => {
    lane.dispatchEvent(new MouseEvent('pointerdown', { clientX: seconds * 60, bubbles: true }));
    lane.dispatchEvent(new MouseEvent('pointerup', { clientX: seconds * 60, bubbles: true }));
  });
};
/** The range input of an inspector row, found by the caption of its row. */
const rowInput = (caption: string): HTMLInputElement => {
  const row = [...document.querySelectorAll('aside label.insp-row')].find((l) => l.querySelector('span')?.textContent === caption);
  if (!row) throw new Error(`no row "${caption}"`);
  return row.querySelector('input')!;
};
const rowOutput = (caption: string) => [...document.querySelectorAll('aside label.insp-row')].find((l) => l.querySelector('span')?.textContent === caption)!.querySelector('output')!.textContent;
const slide = (el: HTMLInputElement, value: string) => fireEvent.change(el, { target: { value } });

// ---- 1. keys after clicking a timeline item ----

describe('keyboard shortcuts after clicking a timeline item', () => {
  const withPicture = () => proj({ sources: [V1, A], layers: [media('pa', 'src2', 0)] });

  it('is built on a real button.tl-hit, which is where the focus is after a click', async () => {
    await mount(withPicture());
    expect(bar('Picture: a.png').className).toContain('tl-hit');
  });

  it('Delete removes the clicked item, Cmd+Z brings it back', async () => {
    await mount(withPicture());
    await click('Picture: a.png');
    fireEvent.keyDown(bar('Picture: a.png'), { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'Picture: a.png' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(screen.getByRole('button', { name: 'Picture: a.png' })).toBeTruthy();
  });

  it('Cmd+D duplicates it with a new id on the lane above, and Cmd+Z undoes that', async () => {
    const { m } = await mount(withPicture());
    await click('Picture: a.png');
    fireEvent.keyDown(bar('Picture: a.png'), { key: 'd', metaKey: true });
    expect(screen.getAllByRole('button', { name: 'Picture: a.png' })).toHaveLength(2);
    const h = await kept(m, (x) => x.present.layers.length === 2);
    const [orig, copy] = h.present.layers as MediaLayer[];
    expect(copy!.id).not.toBe(orig!.id);
    expect(orig!.track).toBe(0);
    expect(copy!.track).toBe(1); // top lane + 1
    expect([copy!.x, copy!.y]).toEqual([orig!.x + 24, orig!.y + 24]);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(screen.getAllByRole('button', { name: 'Picture: a.png' })).toHaveLength(1);
  });

  it('S splits the main track at the playhead', async () => {
    await mount(withPicture());
    await click(/^Clip 1/); // choosing a clip also puts the playhead at its start
    await pressTimelineAt(30);
    fireEvent.keyDown(bar(/^Clip 1/), { key: 's' });
    expect(clips().map((c) => c.getAttribute('aria-label'))).toEqual(['Clip 1, 0:30', 'Clip 2, 0:30']);
  });

  it('does nothing while typing in a text box or another input', async () => {
    await mount(proj());
    await click('Add text');
    const box = screen.getByLabelText('Text', { selector: 'textarea' });
    fireEvent.keyDown(box, { key: 'Delete' });
    fireEvent.keyDown(box, { key: 'Backspace' });
    fireEvent.keyDown(box, { key: 's' });
    fireEvent.keyDown(box, { key: 'd', metaKey: true });
    fireEvent.keyDown(box, { key: 'z', metaKey: true });
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1); // not removed, not duplicated, not undone
    expect(clips()).toHaveLength(1); // S did not split
    const from = screen.getByLabelText('Shown from (seconds)');
    fireEvent.keyDown(from, { key: 'Delete' });
    expect(screen.getAllByRole('button', { name: /^Text:/ })).toHaveLength(1);
  });

  it('Space on a focused button does not play, but Space on the canvas does', async () => {
    await mount(withPicture());
    await act(async () => {
      fireEvent.keyDown(bar('Picture: a.png'), { key: ' ' });
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document.querySelector('canvas')!, { key: ' ' });
    });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document.querySelector('canvas')!, { key: ' ' });
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('Backspace and Delete with nothing selected change nothing', async () => {
    const { m } = await mount(withPicture());
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Picture: a.png' })).toBeTruthy();
    expect(clips()).toHaveLength(1);
    expect(undoButton().disabled).toBe(true); // no step was made
    expect(saved(m).hist.past).toHaveLength(0);
  });

  it('Escape drops the selection', async () => {
    await mount(withPicture());
    await click('Picture: a.png');
    expect(screen.queryByRole('region', { name: 'Video settings' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'Video settings' })).toBeTruthy();
  });

  it('is a handler on window, and only while the tool is the one shown', async () => {
    const { setActive } = await mount(withPicture(), { active: false });
    await click('Picture: a.png');
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Picture: a.png' })).toBeTruthy(); // hidden tool: keys ignored
    await act(async () => setActive(true));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'Picture: a.png' })).toBeNull();
  });

  it('stops listening when the tool is hidden again', async () => {
    const { setActive } = await mount(withPicture());
    await click('Picture: a.png');
    await act(async () => setActive(false));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Picture: a.png' })).toBeTruthy();
  });
});

// ---- 2. the order buttons ----

describe('the order buttons of a picture or video layer', () => {
  const cases: [string, string, string, number][] = [
    ['front on the top one leaves its lane (no creeping)', 'Picture: c.png', 'Bring to front', 2],
    ['back on the top one puts it on lane 0', 'Picture: c.png', 'Send to back', 0],
    ['back on the bottom one stays on lane 0', 'Picture: a.png', 'Send to back', 0],
    ['front on the bottom one goes above the rest', 'Picture: a.png', 'Bring to front', 3],
    ['forward moves one lane', 'Picture: a.png', 'Bring forward', 1],
    ['forward on the top one stays (no creeping)', 'Picture: c.png', 'Bring forward', 2],
    ['backward moves one lane', 'Picture: b.png', 'Send backward', 0],
    ['backward on the bottom one stays on lane 0', 'Picture: a.png', 'Send backward', 0],
  ];
  const id = (name: string) => ({ 'Picture: a.png': 'pa', 'Picture: b.png': 'pb', 'Picture: c.png': 'pc' })[name]!;

  it.each(cases)('%s, in one undo step', async (_t, barName, button, lane) => {
    const { m } = await mount(three());
    await click(barName);
    await click(button);
    const h = await kept(m, (x) => x.past.length === 1);
    expect((layerOf(h.present, id(barName)) as MediaLayer).track).toBe(lane);
    const others = h.present.layers.filter((l) => l.id !== id(barName)) as MediaLayer[];
    expect(others.map((l) => l.track).sort()).toEqual(['pa', 'pb', 'pc'].filter((x) => x !== id(barName)).map((x) => ({ pa: 0, pb: 1, pc: 2 })[x]!)); // nobody else moved
    await click('Undo');
    expect(undoButton().disabled).toBe(true); // one press undid the whole change
  });
});

// ---- 3. clear all ----

describe('Clear everything', () => {
  const clearButton = () => bar('Clear everything: all text and cuts');

  it('is disabled when there is nothing to clear', async () => {
    await mount(proj());
    expect(clearButton().disabled).toBe(true);
  });

  it('with a still first (a freeze at 0) restores the first VIDEO whole, with no layers', async () => {
    const p = proj({
      sources: [A, V1],
      clips: [{ id: 'still', srcId: 'src2', start: 0, end: 3 }, { id: 'c1', srcId: 'src1', start: 10, end: 20 }],
      layers: [newLayer({ x: 1, y: 1, text: 'Zdravo', start: 0, end: 2, track: 0 })],
    });
    const { m } = await mount(p);
    expect(clearButton().disabled).toBe(false);
    await click('Clear everything: all text and cuts');
    expect(clips().map((c) => c.getAttribute('aria-label'))).toEqual(['Clip 1, 1:00']);
    expect(screen.queryByRole('button', { name: /^Text:/ })).toBeNull();
    const h = await kept(m, (x) => x.past.length === 1);
    expect(h.present.clips).toEqual([expect.objectContaining({ srcId: 'src1', start: 0, end: 60 })]);
    expect(h.present.layers).toEqual([]);
    expect(clearButton().disabled).toBe(true); // nothing left to clear
    await click('Undo');
    expect(clips()).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Text: Zdravo/ })).toBeTruthy();
  });
});

// ---- 4. freeze frame ----

describe('Freeze frame', () => {
  /** jsdom never loads a video: say it loaded as soon as it is given a source. */
  const loadsAtOnce = () => {
    Object.defineProperty(HTMLVideoElement.prototype, 'src', {
      configurable: true,
      get() {
        return this._src ?? '';
      },
      set(v: string) {
        this._src = v;
        queueMicrotask(() => (this as HTMLVideoElement).onloadeddata?.(new Event('loadeddata')));
      },
    });
    HTMLVideoElement.prototype.load = () => {};
  };
  afterEach(() => {
    delete (HTMLVideoElement.prototype as unknown as { src?: string }).src;
  });

  it('adds a 3 second still at the playhead; the edit grows by 3 s', async () => {
    loadsAtOnce();
    mocks.freezeFrame.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const { m } = await mount(proj());
    await pressTimelineAt(30);
    expect(bar('Freeze frame').disabled).toBe(false);
    await click('Freeze frame');
    await waitFor(() => expect(clips()).toHaveLength(3));
    expect(mocks.freezeFrame).toHaveBeenCalledTimes(1);
    expect(mocks.freezeFrame.mock.calls[0]![1]).toBe(30); // the moment of the source taken
    expect(clips().map((c) => c.getAttribute('aria-label'))).toEqual(['Clip 1, 0:30', 'Clip 2, 0:03', 'Clip 3, 0:30']);
    expect(screen.getByText(/\/ 1:03\.0/)).toBeTruthy();
    const h = await kept(m, (x) => x.present.clips.length === 3);
    const still = h.present.clips[1]!;
    expect([still.start, still.end]).toEqual([0, 3]);
    expect(h.present.sources.find((s) => s.id === still.srcId)?.kind).toBe('image');
  });

  it('is disabled while the playhead is on a still', async () => {
    loadsAtOnce();
    mocks.freezeFrame.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    await mount(proj());
    await pressTimelineAt(30);
    await click('Freeze frame');
    await waitFor(() => expect(clips()).toHaveLength(3));
    await pressTimelineAt(31); // inside the still (30 to 33)
    expect(bar('Freeze frame').disabled).toBe(true);
    await pressTimelineAt(10);
    expect(bar('Freeze frame').disabled).toBe(false);
  });

  it('says why when the frame could not be taken, and keeps the edit', async () => {
    loadsAtOnce();
    mocks.freezeFrame.mockRejectedValue(new Error('The video has no picture to take yet.'));
    await mount(proj());
    await click('Freeze frame');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no picture to take'));
    expect(clips()).toHaveLength(1);
  });
});

// ---- 5. extract sound ----

describe('Extract audio', () => {
  const extract = () => click('Extract audio');

  it('from a selected clip: a sound on a new lane over the same stretch, at the clip speed; the clip is muted', async () => {
    const p = proj({
      sources: [V1, A],
      clips: [{ id: 'c1', srcId: 'src1', start: 0, end: 20 }, { id: 'c2', srcId: 'src1', start: 10, end: 30, speed: 2, volume: 0.8, fadeIn: 1 }],
      layers: [newLayer({ x: 1, y: 1, text: 'T', start: 0, end: 2, track: 3 })],
    });
    const { m } = await mount(p);
    await click(/^Clip 2/);
    await extract();
    const h = await kept(m, (x) => x.present.layers.length === 2);
    const a = h.present.layers.find(isAudio)!;
    expect(a).toMatchObject({ srcId: 'src1', in: 10, start: 20, end: 30, speed: 2, volume: 0.8, fadeIn: 1, track: 4 });
    expect(h.present.clips[1]!.volume).toBe(0);
    expect(h.present.clips[0]!.volume).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Sound: talk.mp4' })).toBeTruthy();
    await click('Undo');
    expect(screen.queryByRole('button', { name: 'Sound: talk.mp4' })).toBeNull();
  });

  it('from a video layer: the same, keeping the layer in place and muting it through the patch', async () => {
    const p = proj({ sources: [V1, V2], layers: [media('mv', 'src4', 1, { in: 5, start: 4, end: 12, speed: 2, volume: 0.5 })] });
    const { m } = await mount(p);
    await click('Video: b.mp4');
    await extract();
    const h = await kept(m, (x) => x.present.layers.length === 2);
    const a = h.present.layers.find(isAudio)!;
    expect(a).toMatchObject({ srcId: 'src4', in: 5, start: 4, end: 12, speed: 2, volume: 0.5, track: 2 });
    const v = h.present.layers.find(isMedia)!;
    expect(v.volume).toBe(0);
    expect([v.start, v.end, v.track]).toEqual([4, 12, 1]);
  });

  it('is not offered for a picture layer or a still on the main track', async () => {
    const p = proj({
      sources: [V1, A],
      clips: [{ id: 'still', srcId: 'src2', start: 0, end: 3 }, { id: 'c1', srcId: 'src1', start: 0, end: 20 }],
      layers: [media('pa', 'src2', 0)],
    });
    await mount(p);
    await click('Picture: a.png');
    expect(screen.queryByRole('button', { name: 'Extract audio' })).toBeNull();
    await click(/^Clip 1/); // the still
    expect(screen.queryByRole('button', { name: 'Extract audio' })).toBeNull();
    await click(/^Clip 2/); // a video: offered
    expect(screen.getByRole('button', { name: 'Extract audio' })).toBeTruthy();
  });
});

// ---- 6. transitions ----

describe('Transition from the clip before', () => {
  const two = () => proj({ clips: [{ id: 'c1', srcId: 'src1', start: 0, end: 20 }, { id: 'c2', srcId: 'src1', start: 20, end: 40 }] });
  const kind = TRANSITION_KINDS[0]!;

  it('is not offered on the first clip', async () => {
    await mount(two());
    await click(/^Clip 1/);
    expect(screen.queryByRole('button', { name: 'Transition from the clip before…' })).toBeNull();
  });

  it('puts the chosen kind on clip 2, and Undo takes it off', async () => {
    const { m } = await mount(two());
    await click(/^Clip 2/);
    await click('Transition from the clip before…');
    expect(screen.getByRole('radiogroup', { name: 'Transition' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: kind.label }));
    });
    const h = await kept(m, (x) => x.past.length === 1);
    expect(h.present.clips[1]!.transitionIn?.kind).toBe(kind.kind);
    expect(h.present.clips[0]!.transitionIn).toBeUndefined();
    await click('Undo');
    const back = await kept(m, (x) => x.present.clips[1]!.transitionIn === undefined && x.future.length === 1);
    expect(back.present.clips[1]!.transitionIn).toBeUndefined();
  });

  it('closes when anything else is selected', async () => {
    await mount(two());
    await click(/^Clip 2/);
    await click('Transition from the clip before…');
    expect(screen.getByRole('radiogroup', { name: 'Transition' })).toBeTruthy();
    await click(/^Clip 1/);
    expect(screen.queryByRole('radiogroup', { name: 'Transition' })).toBeNull();
    await click(/^Clip 2/);
    expect(screen.queryByRole('radiogroup', { name: 'Transition' })).toBeNull(); // back to the clip settings, not the picker
    expect(screen.getByRole('button', { name: 'Transition from the clip before…' })).toBeTruthy();
  });
});

// ---- 7. a drag is one undo step ----

describe('a drag on a slider is one undo step', () => {
  const withVideoLayer = () => proj({ sources: [V1, V2], layers: [media('mv', 'src4', 0, { end: 20 })] });

  it.each([
    ['Opacity', ['0.8', '0.5', '0.3'], '100%'],
    ['Speed', ['0.5', '1', '1.5'], '1x'],
    ['Fade', ['10', '20', '30'], '0'],
    ['Blur', ['3', '6', '9'], '0 px'],
  ] as const)('%s', async (caption, values, original) => {
    await mount(withVideoLayer());
    await click('Video: b.mp4');
    const input = rowInput(caption);
    for (const v of values) slide(input, v);
    expect(rowOutput(caption)).not.toBe(original); // the change took
    expect(undoButton().disabled).toBe(false);
    await click('Undo');
    expect(rowOutput(caption)).toBe(original); // one Undo put everything back
    expect(undoButton().disabled).toBe(true);
  });

  it('Volume and the fades of the sound panel', async () => {
    await mount(withVideoLayer());
    await click('Video: b.mp4');
    for (const v of ['0.9', '0.6', '0.4']) slide(rowInput('Volume'), v);
    await click('Undo');
    expect(undoButton().disabled).toBe(true);
  });

  it('two runs more than a moment apart are two steps', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await mount(withVideoLayer());
    await click('Video: b.mp4');
    slide(rowInput('Opacity'), '0.8');
    slide(rowInput('Opacity'), '0.7');
    now.mockReturnValue(1_005_000);
    slide(rowInput('Opacity'), '0.4');
    await click('Undo');
    expect(rowOutput('Opacity')).toBe('70%');
    expect(undoButton().disabled).toBe(false);
    await click('Undo');
    expect(rowOutput('Opacity')).toBe('100%');
    expect(undoButton().disabled).toBe(true);
  });

  it('typing in the on-canvas text box merges into one step', async () => {
    await mount(proj());
    await click('Add text');
    await click('Edit');
    const box = screen.getByLabelText('Type on the picture') as HTMLTextAreaElement;
    for (const t of ['H', 'He', 'Hel', 'Hello']) fireEvent.change(box, { target: { value: t } });
    expect(screen.getByRole('button', { name: /^Text: Hello/ })).toBeTruthy();
    await click('Undo'); // the typing goes in one step
    expect(screen.getByRole('button', { name: /^Text: Your text/ })).toBeTruthy();
    await click('Undo'); // and the step before it is the adding of the text
    expect(screen.queryByRole('button', { name: /^Text:/ })).toBeNull();
  });
});

// ---- 8. speed changes the length ----

describe('a speed change on a layer', () => {
  const speedBtn = (label: string) => click(label);

  it('twice as fast is half as long, and slower is longer', async () => {
    const { m } = await mount(proj({ sources: [V1, V2], layers: [media('mv', 'src4', 0, { start: 3, end: 13 })] }));
    await click('Video: b.mp4');
    await speedBtn('2x');
    let h = await kept(m, (x) => x.past.length === 1);
    expect((layerOf(h.present, 'mv') as MediaLayer).speed).toBe(2);
    expect(layerOf(h.present, 'mv').end).toBe(8); // 10 s at 1x is 5 s at 2x
    await speedBtn('0.5x'); // (within a moment of the first press, so it joins that one undo step)
    h = await kept(m, (x) => layerOf(x.present, 'mv').end === 23); // 5 s of that at 0.5x is 20 s
    expect((layerOf(h.present, 'mv') as MediaLayer).speed).toBe(0.5);
  });

  it('never runs past the end of its file', async () => {
    const { m } = await mount(proj({ sources: [V1, V2], layers: [media('mv', 'src4', 0, { in: 50, start: 0, end: 20 })] }));
    await click('Video: b.mp4');
    await speedBtn('2x');
    const h = await kept(m, (x) => x.past.length === 1);
    expect(layerOf(h.present, 'mv').end).toBe(5); // 10 s of the file are left, which is 5 s at 2x (not the 10 s that halving 20 would give)
  });

  it('works the same on a sound layer', async () => {
    const { m } = await mount(proj({ sources: [V1, SND], layers: [sound('sn', 0, { in: 10, start: 5, end: 25 })] }));
    await click('Sound: tune.mp3');
    await speedBtn('2x');
    const h = await kept(m, (x) => x.past.length === 1);
    expect(layerOf(h.present, 'sn')).toMatchObject({ speed: 2, start: 5, end: 15 });
  });
});

// ---- 9. export ----

describe('saving the video', () => {
  const done = { blob: new Blob(['v'], { type: 'video/webm' }), mime: 'video/webm' };

  it('hands the project, the frame and the master volume to the exporter', async () => {
    mocks.exportVideo.mockResolvedValue(done);
    const p = proj({ layers: [newLayer({ x: 1, y: 1, text: 'Hi', start: 0, end: 2, track: 0 })] });
    await mount(p);
    await click('Save video');
    await waitFor(() => expect(screen.getByText(/Saved\. The new video/)).toBeTruthy());
    const o = mocks.exportVideo.mock.calls[0]![0];
    expect(o.project).toEqual(p);
    expect(o.size).toEqual({ w: 1280, h: 720 });
    expect(o.masterVolume).toBe(1);
    expect(mocks.downloadBlob).toHaveBeenCalledWith('talk-edited.webm', done.blob);
  });

  it('uses the chosen volume, and 0 when the sound is off', async () => {
    mocks.exportVideo.mockResolvedValue(done);
    await mount(proj());
    slide(screen.getByLabelText('Volume') as HTMLInputElement, '50');
    await click('Save video');
    await waitFor(() => expect(mocks.exportVideo).toHaveBeenCalledTimes(1));
    expect(mocks.exportVideo.mock.calls[0]![0].masterVolume).toBe(0.5);
    await waitFor(() => expect(screen.getByText(/Saved\./)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Sound is on' }));
    });
    await click('Save video');
    await waitFor(() => expect(mocks.exportVideo).toHaveBeenCalledTimes(2));
    expect(mocks.exportVideo.mock.calls[1]![0].masterVolume).toBe(0);
  });

  it('while it runs, adding files and shortcuts are ignored and the editing surface is inert', async () => {
    let finish: (v: typeof done) => void = () => {};
    mocks.exportVideo.mockImplementation(() => new Promise((ok) => (finish = ok)));
    await mount(proj({ sources: [V1, A], layers: [media('pa', 'src2', 0)] }));
    await click('Picture: a.png');
    await click('Save video');
    await waitFor(() => expect(screen.getByText(/Saving…/)).toBeTruthy());
    for (const el of [document.querySelector('.canvas-wrap'), document.querySelector('.transport'), document.querySelector('aside[aria-label=Controls]'), document.querySelector('.tl')!.parentElement]) {
      expect(el!.hasAttribute('inert')).toBe(true);
    }
    expect((screen.getByLabelText('Add a video, picture or sound') as HTMLInputElement).disabled).toBe(true);
    expect(bar('Add text').disabled).toBe(true);
    // shortcuts
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(document.body, { key: 'd', metaKey: true });
    expect(screen.getAllByRole('button', { name: 'Picture: a.png' })).toHaveLength(1);
    // a file arriving anyway
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a video, picture or sound'), { target: { files: [new File(['x'], 'more.mp4', { type: 'video/mp4' })] } });
    });
    expect(clips()).toHaveLength(1);
    await act(async () => finish(done));
    await waitFor(() => expect(screen.getByText(/Saved\./)).toBeTruthy());
    expect(document.querySelector('.canvas-wrap')!.hasAttribute('inert')).toBe(false);
    expect(clips()).toHaveLength(1);
  });

  it('Cancel aborts the export, and leaving the editor does too', async () => {
    const signals: AbortSignal[] = [];
    mocks.exportVideo.mockImplementation((o: { signal: AbortSignal }) => {
      signals.push(o.signal);
      return new Promise(() => {});
    });
    const view = await mount(proj());
    await click('Save video');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy());
    await click('Cancel');
    expect(signals[0]!.aborted).toBe(true);
    cleanup();
    void view;

    const second = await mount(proj());
    await click('Save video');
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[1]!.aborted).toBe(false);
    cleanup(); // unmount
    expect(signals[1]!.aborted).toBe(true);
    void second;
  });

  it('says why when the export fails, and offers to save again', async () => {
    mocks.exportVideo.mockRejectedValue(new Error('This browser cannot record video.'));
    await mount(proj());
    await click('Save video');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot record video'));
    expect(bar('Save video')).toBeTruthy();
  });
});

// ---- 10. captions across two sources ----

describe('captions across two videos', () => {
  const two = () =>
    proj({
      sources: [V1, V2],
      clips: [{ id: 'c1', srcId: 'src1', start: 0, end: 60 }, { id: 'c2', srcId: 'src4', start: 0, end: 60 }],
      layers: [newLayer({ x: 1, y: 1, text: 'Existing', start: 0, end: 2, track: 3 })],
    });
  const transcriberFactory = () => {
    let n = 0;
    return (): Transcriber => {
      const k = ++n;
      return { load: async (_r, onProgress) => onProgress({ fraction: 1, file: 'x' }), transcribe: async () => [{ text: ` caption ${k} `, timestamp: [1, 3] }], dispose: () => {} };
    };
  };
  const samples = () => new Float32Array(SAMPLE_RATE * 10);
  const ask = async () => {
    await click('Make captions from the speech');
    await click('Make captions');
  };

  it('puts each video on its own new lane above the layers, timed by that video\'s own clip', async () => {
    const { m } = await mount(two(), { props: { makeTranscriber: transcriberFactory(), decodeAudio: async () => ({ samples: samples(), seconds: 60 }) } });
    await ask();
    await waitFor(() => expect(screen.getByText(/Added 2 captions/)).toBeTruthy());
    const h = await kept(m, (x) => x.present.layers.length === 3);
    const text = h.present.layers.filter(isText);
    const one = text.find((l) => l.text === 'caption 1')!;
    const two2 = text.find((l) => l.text === 'caption 2')!;
    expect(one.track).toBe(4);
    expect(two2.track).toBe(5);
    expect(one.start).toBeCloseTo(1, 1); // from the first clip
    expect(two2.start).toBeCloseTo(61, 1); // the second source's clip starts at 60 on the edit
  });

  it('keeps the first video\'s captions when stopped during the second', async () => {
    let calls = 0;
    const decodeAudio = async () => {
      if (++calls === 2) {
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      }
      return { samples: samples(), seconds: 60 };
    };
    const { m } = await mount(two(), { props: { makeTranscriber: transcriberFactory(), decodeAudio } });
    await ask();
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.queryByText(/Reading the sound|Transcribing|speech model/)).toBeNull());
    expect(screen.getByRole('button', { name: /^Text: caption 1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Text: caption 2/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull(); // stopping is not a failure
    const h = await kept(m, (x) => x.present.layers.length === 2);
    expect(h.present.layers.filter(isText).map((l) => l.text).sort()).toEqual(['Existing', 'caption 1']);
  });
});

// ---- 11. restoring ----

describe('restoring a saved edit', () => {
  const longClip = (end: number) => proj({ clips: [{ id: 'c1', srcId: 'src1', start: 0, end }] });

  it('clamps a clip that runs past its source, also in the undo and redo steps', async () => {
    const hist: H.History<VideoProject> = { past: [longClip(90)], present: longClip(45), future: [longClip(80)] };
    await mount(hist);
    expect(screen.getByText(/0:00\.0 \/ 0:45\.0/)).toBeTruthy();
    await click('Undo');
    expect(screen.getByText(/\/ 1:00\.0/)).toBeTruthy(); // 90 was cut back to the 60 s the file has
    await click('Redo');
    await click('Redo');
    expect(screen.getByText(/\/ 1:00\.0/)).toBeTruthy(); // so was 80
    expect(clips()[0]!.getAttribute('aria-label')).toBe('Clip 1, 1:00');
  });

  it('clamps the present too', async () => {
    await mount(longClip(95));
    expect(screen.getByText(/0:00\.0 \/ 1:00\.0/)).toBeTruthy();
  });

  it('says so and keeps the project when a source file is missing', async () => {
    const p = proj({ sources: [V1, A], layers: [media('pa', 'src2', 0)] });
    const m = seeded(p);
    m.data.delete(sourceKey('src2'));
    await mount(p, { store: m });
    expect(screen.getByRole('alert').textContent).toContain('A file used by this edit could not be found');
    expect(screen.getByRole('button', { name: 'Picture: a.png' })).toBeTruthy();
    expect(clips()).toHaveLength(1);
  });

  it('counts several missing files', async () => {
    const p = proj({ sources: [V1, A, B], layers: [media('pa', 'src2', 0), media('pb', 'src5', 1)] });
    const m = seeded(p);
    m.data.delete(sourceKey('src2'));
    m.data.delete(sourceKey('src5'));
    await mount(p, { store: m });
    expect(screen.getByRole('alert').textContent).toContain('2 files');
  });

  it('does not overwrite a video opened while the restore was still slow', async () => {
    const m = seeded(H.push(H.start(proj()), proj({ layers: [newLayer({ x: 1, y: 1, text: 'Zdravo', start: 0, end: 2, track: 0 })] })));
    const real = m.load.bind(m);
    let release: () => void = () => {};
    const gate = new Promise<void>((ok) => (release = ok));
    m.load = async () => {
      await gate;
      return real();
    };
    let send: (f: File) => void = () => {};
    function Sender() {
      const lib = useLibrary();
      send = (f) => lib.open(lib.add([f])[0]!);
      return null;
    }
    render(
      <LibraryProvider path="/studio/video">
        <VideoEditor store={m} />
        <Sender />
      </LibraryProvider>,
    );
    expect(screen.getByText('Getting your video back…')).toBeTruthy();
    await act(async () => send(new File(['x'], 'other.mp4', { type: 'video/mp4' })));
    await act(async () => release());
    await toolbar();
    await waitFor(() => expect(document.querySelector('.editor-file')!.textContent).toBe('other.mp4'));
    expect(screen.queryByRole('button', { name: /^Text: Zdravo/ })).toBeNull();
    expect(undoButton().disabled).toBe(true); // the old undo steps did not come back either
  });
});

// ---- 12. auto-keyframe ----

describe('editing an animated value at the playhead', () => {
  const animated = () =>
    proj({
      sources: [V1, A],
      layers: [media('pa', 'src2', 0, { start: 2, end: 12, x: 100, tracks: [{ prop: 'x', keys: [{ t: 0, value: 100, ease: 'linear' }, { t: 4, value: 300, ease: 'linear' }] }] })],
    });
  const xKeys = (p: VideoProject) => (layerOf(p, 'pa') as MediaLayer).tracks!.find((t) => t.prop === 'x')!.keys;

  it('typing a position makes a key at (time - start) and leaves the base x alone', async () => {
    const { m } = await mount(animated());
    await click('Picture: a.png'); // choosing a bar also moves the playhead to its start
    await pressTimelineAt(5); // 3 s into the layer
    const x = screen.getByLabelText('Position x') as HTMLInputElement;
    expect(Number(x.value)).toBe(250); // what the animation gives at 3 s
    fireEvent.change(x, { target: { value: '400' } });
    const h = await kept(m, (v) => v.past.length === 1);
    expect(xKeys(h.present).map((k) => [k.t, k.value])).toEqual([[0, 100], [3, 400], [4, 300]]);
    expect((layerOf(h.present, 'pa') as MediaLayer).x).toBe(100);
  });

  it('a value that has no track is just changed', async () => {
    const { m } = await mount(animated());
    await click('Picture: a.png');
    await pressTimelineAt(5);
    fireEvent.change(screen.getByLabelText('Position y'), { target: { value: '55' } });
    const h = await kept(m, (v) => v.past.length === 1);
    expect((layerOf(h.present, 'pa') as MediaLayer).y).toBe(55);
    expect(xKeys(h.present)).toHaveLength(2);
  });

  it('an arrow key on the box on the canvas nudges the animated x as a key, too', async () => {
    const { m } = await mount(animated());
    await click('Picture: a.png');
    await pressTimelineAt(5);
    const box = await waitFor(() => screen.getByLabelText(/^Selected picture/));
    await act(async () => {
      fireEvent.keyDown(box, { key: 'ArrowRight' });
    });
    const h = await kept(m, (v) => v.past.length === 1);
    expect(xKeys(h.present).map((k) => [k.t, k.value])).toEqual([[0, 100], [3, 251], [4, 300]]);
    expect((layerOf(h.present, 'pa') as MediaLayer).x).toBe(100);
  });
});
