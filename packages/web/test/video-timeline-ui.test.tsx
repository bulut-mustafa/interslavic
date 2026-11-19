// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Timeline } from '../src/video/Timeline.tsx';
import type { ProjectChange, Selection, TimelineProps } from '../src/video/contracts.ts';
import { emptyProject, type MediaLayer, type VideoProject } from '../src/video/project.ts';
import type { TextLayer } from '../src/editor/layers.ts';

const peaks = vi.hoisted(() => vi.fn(async (_f: Blob, n: number, _s?: AbortSignal) => new Float32Array(n).fill(0.5)));
vi.mock('../src/video/waveform.ts', async (orig) => ({ ...(await orig<typeof import('../src/video/waveform.ts')>()), peaksOf: peaks }));

afterEach(cleanup);

const text = (id: string, start: number, end: number, track = 0): TextLayer => ({ id, text: `hello ${id}`, x: 0, y: 0, maxWidth: 0, style: {} as never, start, end, track });
const pic: MediaLayer = { id: 'p1', kind: 'media', srcId: 'img', start: 1, end: 3, track: 1, in: 0, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' };
const project = (over: Partial<VideoProject> = {}): VideoProject => ({
  ...emptyProject(),
  sources: [{ id: 'v', kind: 'video', name: 'talk.mp4', duration: 60 }, { id: 'img', kind: 'image', name: 'logo.png' }, { id: 'au', kind: 'audio', name: 'song.mp3', duration: 30 }],
  clips: [{ id: 'c1', srcId: 'v', start: 0, end: 10 }, { id: 'c2', srcId: 'v', start: 20, end: 30 }],
  layers: [text('t1', 2, 6), text('t2', 8, 10)],
  ...over,
});

function setup(over: Partial<TimelineProps> & { onTransition?: (id: string) => void } = {}, extra: { fileOf?: (id: string) => File | null } = {}) {
  const changes: [ProjectChange, string][] = [];
  const selected: Selection[] = [];
  const props: TimelineProps & { onTransition?: (id: string) => void } = {
    project: project(),
    time: 0,
    selection: { kind: 'layer', id: 't1' },
    zoom: 100,
    onZoom: vi.fn(),
    snapping: true,
    onSnapping: vi.fn(),
    strips: [],
    onSeek: vi.fn(),
    onSelect: (s) => selected.push(s),
    onChange: (c, m) => changes.push([c, m]),
    onScrubStart: vi.fn(),
    ...over,
  };
  const view = render(<Timeline {...props} {...extra} />);
  const lanes = view.container.querySelector('.timeline-lanes') as HTMLElement;
  lanes.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 300, right: 2000, bottom: 300, x: 0, y: 0, toJSON: () => {} });
  const fire = (el: Element, type: string, x: number, y = 100) =>
    act(async () => {
      el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
    });
  return { props, changes, selected, lanes, fire, view, item: (id: string) => view.container.querySelector(`[data-item="${id}"]`) as HTMLElement };
}

describe('the timeline', () => {
  it('names its items in the usual style', () => {
    const t = setup({ project: project({ layers: [text('t1', 2, 6), pic, { id: 'a1', kind: 'audio', srcId: 'au', start: 0, end: 5, track: 2, in: 0 }, { ...pic, id: 'v1', srcId: 'v', track: 3 }] }) });
    const names = Array.from(t.view.container.querySelectorAll('button.tl-hit')).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(expect.arrayContaining(['Clip 1, 0:10', 'Clip 2, 0:10', 'Text: hello t1', 'Picture: logo.png', 'Sound: song.mp3', 'Video: talk.mp4']));
  });

  it('has edge handles on every bar, so any bar can be trimmed (drawn on hover, focus and when picked)', () => {
    const t = setup();
    expect(t.item('layer:t1').querySelectorAll('[data-edge]').length).toBe(2);
    expect(t.item('layer:t2').querySelectorAll('[data-edge]').length).toBe(2);
    expect(t.item('layer:t1').classList.contains('is-selected')).toBe(true);
    expect(t.item('layer:t2').classList.contains('is-selected')).toBe(false);
  });

  it('trims an unselected bar from its handle and selects it, without moving it on a plain click', async () => {
    const t = setup({ selection: null });
    const h = t.item('layer:t2').querySelector('[data-edge="end"]')!;
    await t.fire(h, 'pointerdown', 1000);
    await t.fire(h, 'pointerup', 1000);
    expect(t.selected).toContainEqual({ kind: 'layer', id: 't2' });
    expect(t.changes).toEqual([]);
  });

  it('names what each lane mostly holds, and the main track Video', () => {
    const t = setup({ project: project({ layers: [text('t1', 2, 6), text('t2', 8, 10), pic] }) });
    const labels = (name: string) => t.view.container.querySelector(`[aria-label="${name}"] .tl-lane-label`)?.textContent;
    expect(labels('Lane 1')).toBe('Text');
    expect(labels('Lane 2')).toBe('Picture');
    expect(labels('Lane 3')).toBeUndefined(); // the free lane has no label
    expect(labels('Main track')).toBe('Video');
  });

  it('selects a bar when it is pressed or pressed with the keyboard', async () => {
    const t = setup({ selection: null });
    await t.fire(t.item('layer:t2').querySelector('button')!, 'pointerdown', 850);
    await t.fire(t.lanes, 'pointerup', 850);
    expect(t.selected).toContainEqual({ kind: 'layer', id: 't2' });
    expect(t.changes).toEqual([]); // a click never edits
    fireEvent.click(t.item('clip:c2').querySelector('button')!);
    expect(t.selected).toContainEqual({ kind: 'clip', id: 'c2' });
    expect(t.props.onSeek).toHaveBeenCalledWith(10);
  });

  it('trims the right edge: a preview for each move, then one end with the new end', async () => {
    const t = setup();
    const handle = t.item('layer:t1').querySelector('[data-edge="end"]')!;
    await t.fire(handle, 'pointerdown', 600);
    expect(t.props.onScrubStart).toHaveBeenCalled();
    await t.fire(handle, 'pointermove', 650);
    await t.fire(handle, 'pointermove', 700);
    await t.fire(handle, 'pointerup', 700);
    expect(t.changes.map((c) => c[1])).toEqual(['preview', 'preview', 'end']);
    const last = t.changes.at(-1)![0].layers!.find((l) => l.id === 't1')!;
    expect(last.end).toBeCloseTo(7);
    expect(last.start).toBe(2);
  });

  it('snaps to another item\'s edge near it, and not when snapping is off', async () => {
    const run = async (snapping: boolean) => {
      const t = setup({ snapping });
      const h = t.item('layer:t1').querySelector('[data-edge="end"]')!;
      await t.fire(h, 'pointerdown', 600);
      await t.fire(h, 'pointermove', 796); // 7.96 s, 4 px from t2's start at 8 s
      const guide = !!t.view.container.querySelector('.tl-guide');
      await t.fire(h, 'pointerup', 796);
      return { end: t.changes.at(-1)![0].layers!.find((l) => l.id === 't1')!.end!, guide };
    };
    expect(await run(true)).toEqual({ end: 8, guide: true });
    const off = await run(false);
    expect(off.end).toBeCloseTo(7.96);
    expect(off.guide).toBe(false);
  });

  it('does not snap beyond the threshold', async () => {
    const t = setup();
    const h = t.item('layer:t1').querySelector('[data-edge="end"]')!;
    await t.fire(h, 'pointerdown', 600);
    await t.fire(h, 'pointermove', 780); // 7.8 s: 20 px away
    await t.fire(h, 'pointerup', 780);
    expect(t.changes.at(-1)![0].layers!.find((l) => l.id === 't1')!.end).toBeCloseTo(7.8);
  });

  it('moves a body drag in time and to another lane', async () => {
    const t = setup();
    const body = t.item('layer:t1').querySelector('button')!;
    // lane rows: 2 rows of 36 px under the 26 px ruler; y 30 is the top row (lane 2)
    await t.fire(body, 'pointerdown', 400, 70);
    await t.fire(body, 'pointermove', 500, 40);
    await t.fire(body, 'pointerup', 500, 40);
    const l = t.changes.at(-1)![0].layers!.find((x) => x.id === 't1')!;
    expect(l.start).toBeCloseTo(3);
    expect(l.end).toBeCloseTo(7);
    expect(l.track).toBe(1);
  });

  it('reorders the main track by dragging, with an insertion marker', async () => {
    const t = setup({ selection: null });
    const body = t.item('clip:c1').querySelector('button')!;
    await t.fire(body, 'pointerdown', 200, 150);
    await t.fire(body, 'pointermove', 1700, 150);
    expect(t.view.container.querySelector('.tl-marker')).toBeTruthy();
    await t.fire(body, 'pointerup', 1700, 150);
    expect(t.changes.at(-1)![0].clips!.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(t.changes.at(-1)![1]).toBe('end');
  });

  it('trims a main clip from its right edge and the next clip follows', async () => {
    const t = setup({ selection: { kind: 'clip', id: 'c1' }, project: project({ layers: [] }) });
    const h = t.item('clip:c1').querySelector('[data-edge="end"]')!;
    await t.fire(h, 'pointerdown', 1000);
    await t.fire(h, 'pointermove', 800); // 2 s shorter
    await t.fire(h, 'pointerup', 800);
    const clips = t.changes.at(-1)![0].clips!;
    expect(clips[0]).toMatchObject({ start: 0, end: 8 });
    expect(clips[1]).toMatchObject({ start: 20, end: 30 });
  });

  it('puts the cancelled drag back as it was', async () => {
    const t = setup();
    const h = t.item('layer:t1').querySelector('[data-edge="end"]')!;
    await t.fire(h, 'pointerdown', 600);
    await t.fire(h, 'pointermove', 700);
    await t.fire(h, 'pointercancel', 700);
    expect(t.changes.at(-1)![1]).toBe('end');
    expect(t.changes.at(-1)![0].layers).toEqual(t.props.project.layers);
  });

  it('scrubs from the ruler', async () => {
    const t = setup();
    await t.fire(t.lanes, 'pointerdown', 250, 10);
    expect(t.props.onScrubStart).toHaveBeenCalled();
    expect(t.props.onSeek).toHaveBeenCalledWith(2.5);
    await t.fire(t.lanes, 'pointerup', 300, 10);
    expect(t.props.onSeek).toHaveBeenLastCalledWith(3);
  });

  it('nudges a focused item by 0.1 s with the arrow keys and leaves Delete alone', () => {
    const t = setup();
    const b = t.item('layer:t1').querySelector('button')!;
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    expect(t.changes[0]![1]).toBe('commit');
    expect(t.changes[0]![0].layers!.find((l) => l.id === 't1')).toMatchObject({ start: 2.1, end: 6.1 });
    fireEvent.keyDown(b, { key: 'ArrowRight', altKey: true });
    expect(t.changes[1]![0].layers!.find((l) => l.id === 't1')).toMatchObject({ start: 2, end: 6.1 });
    const n = t.changes.length;
    fireEvent.keyDown(b, { key: 'Delete' });
    expect(t.changes.length).toBe(n);
  });

  it('toggles snapping and zooms from its controls', () => {
    const t = setup();
    fireEvent.click(t.view.getByRole('button', { name: 'Snapping' }));
    expect(t.props.onSnapping).toHaveBeenCalledWith(false);
    fireEvent.click(t.view.getByRole('button', { name: 'Zoom in' }));
    expect(t.props.onZoom).toHaveBeenCalledWith(125);
  });

  it('zooms with ctrl + wheel and stops the page zooming', () => {
    const t = setup();
    const scroll = t.view.container.querySelector('.tl-scroll')!;
    const ev = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    scroll.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect((t.props.onZoom as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeGreaterThan(100);
    const plain = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    scroll.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
  });
});

describe('transition joints', () => {
  const joint = (t: ReturnType<typeof setup>, n = 0) => t.view.container.querySelectorAll<HTMLButtonElement>('button.tl-joint')[n]!;

  it('has one keyboard-reachable joint between each pair of main clips, none before the first', () => {
    const t = setup();
    expect(t.view.container.querySelectorAll('button.tl-joint').length).toBe(1);
    expect(joint(t).getAttribute('aria-label')).toBe('Transition between clip 1 and clip 2: none');
    expect(joint(t).tabIndex).not.toBe(-1);
  });
  it('is placed on the cut', () => {
    const t = setup();
    expect(joint(t).parentElement!.style.left).toBe('1000px');
  });
  it('names the kind and shows it is set', () => {
    const t = setup({ project: project({ clips: [{ id: 'c1', srcId: 'v', start: 0, end: 10 }, { id: 'c2', srcId: 'v', start: 20, end: 30, transitionIn: { kind: 'wipe-left', duration: 1 } }] }) });
    expect(joint(t).getAttribute('aria-label')).toBe('Transition between clip 1 and clip 2: Wipe left, 1.0 s');
    expect(joint(t).classList.contains('is-set')).toBe(true);
  });
  it('asks for the picker with the id of the clip after the cut, on click and on the keyboard', () => {
    const onTransition = vi.fn();
    const t = setup({ onTransition });
    fireEvent.click(joint(t));
    expect(onTransition).toHaveBeenCalledWith('c2');
    fireEvent.click(joint(t), { detail: 0 });
    expect(onTransition).toHaveBeenCalledTimes(2);
  });
  it('does not seek or deselect when pressed', () => {
    const t = setup();
    fireEvent.pointerDown(joint(t), { button: 0, clientX: 1000, clientY: 100 });
    expect(t.props.onSeek).not.toHaveBeenCalled();
  });
  it('is disabled-looking but harmless without a handler', () => {
    const t = setup();
    expect(() => fireEvent.click(joint(t))).not.toThrow();
  });
});


describe('keyframe marks', () => {
  const k = (t: number) => ({ t, value: 0, ease: 'linear' as const });
  const keyed = (): VideoProject => project({ layers: [{ ...text('t1', 2, 6), tracks: [{ prop: 'x', keys: [k(0.5), k(2)] }, { prop: 'opacity', keys: [k(2)] }] } as never, text('t2', 8, 10)] });

  it('draws one focusable diamond per moment on the picked bar, named by its time', () => {
    const t = setup({ project: keyed() });
    const keys = Array.from(t.item('layer:t1').querySelectorAll<HTMLButtonElement>('button.tl-key'));
    expect(keys.map((b) => b.getAttribute('aria-label'))).toEqual(['Keyframe at 0:00.5', 'Keyframe at 0:02.0']);
    expect(keys[0]!.tabIndex).not.toBe(-1);
    expect(keys[0]!.style.left).toBe('45px'); // 0.5 s at 100 px/s, minus half the diamond
  });

  it('shows plain marks, not buttons, on a bar that is not picked', () => {
    const t = setup({ project: keyed(), selection: { kind: 'layer', id: 't2' } });
    expect(t.item('layer:t1').querySelectorAll('button.tl-key').length).toBe(0);
    expect(t.item('layer:t1').querySelectorAll('.tl-key').length).toBe(2);
  });

  it('moves the keys of every property at that time with the arrow keys', () => {
    const t = setup({ project: keyed() });
    const second = t.item('layer:t1').querySelectorAll('button.tl-key')[1]!;
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    const [change, mode] = t.changes.at(-1)!;
    expect(mode).toBe('commit');
    const tracks = change.layers!.find((l) => l.id === 't1')!.tracks!;
    expect(tracks.map((x) => x.keys.map((q) => q.t))).toEqual([[0.5, 2.1], [2.1]]);
  });

  it('drags a diamond: previews while moving, one end, keys kept inside the bar', async () => {
    const t = setup({ project: keyed() });
    const d = t.item('layer:t1').querySelectorAll('button.tl-key')[1]!;
    await t.fire(d, 'pointerdown', 400);
    await t.fire(d, 'pointermove', 450);
    await t.fire(d, 'pointermove', 9000);
    await t.fire(d, 'pointerup', 9000);
    expect(t.changes.map((c) => c[1])).toEqual(['preview', 'preview', 'end']);
    const first = t.changes[0]![0].layers!.find((l) => l.id === 't1')!.tracks!;
    expect(first[0]!.keys.map((q) => q.t)).toEqual([0.5, 2.5]);
    const last = t.changes.at(-1)![0].layers!.find((l) => l.id === 't1')!.tracks!;
    expect(last[0]!.keys.map((q) => q.t)).toEqual([0.5, 4]); // the bar is 4 s long
    expect(t.selected).toEqual([]); // dragging a key does not re-pick or move the bar
  });
});

describe('waveforms', () => {
  const file = (name: string) => new File(['x'], name);
  const withSound = (): VideoProject =>
    project({ layers: [{ id: 'a1', kind: 'audio', srcId: 'au', start: 0, end: 15, track: 0, in: 0 } as never] });

  it('decodes each source once, aborts on unmount, and draws a canvas on the sound bar and the clips', async () => {
    const fillRect = vi.fn();
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({ fillRect, fillStyle: '' })) as never;
    peaks.mockClear();
    const fileOf = vi.fn((id: string) => file(id));
    const t = setup({ project: withSound() }, { fileOf });
    await act(async () => {});
    const calls = peaks.mock.calls.map((c) => (c[0] as File).name).sort();
    expect(calls).toEqual(['au', 'v']); // one decode per source, though the video backs two clips
    expect(t.item('layer:a1').querySelector('canvas.tl-wave')).toBeTruthy();
    expect(t.item('clip:c1').querySelector('canvas.tl-wave')).toBeTruthy();
    expect(fillRect).toHaveBeenCalled();
    const signal = peaks.mock.calls[0]![2] as AbortSignal;
    t.view.unmount();
    expect(signal.aborted).toBe(true);
    HTMLCanvasElement.prototype.getContext = orig;
  });

  it('draws no waveform when there is no file or the peaks are empty', async () => {
    peaks.mockClear();
    const t = setup({ project: withSound() }, { fileOf: () => null });
    await act(async () => {});
    expect(peaks).not.toHaveBeenCalled();
    expect(t.view.container.querySelector('canvas')).toBeNull();
    t.view.unmount();
    peaks.mockImplementationOnce(async () => new Float32Array(0));
    const u = setup({ project: withSound() }, { fileOf: (id) => file(id) });
    await act(async () => {});
    expect(u.item('layer:a1').querySelector('canvas')).toBeNull();
  });
});
