// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import PhoneVideo from '../src/phone/video/PhoneVideo.tsx';
import VideoEditor from '../src/video/VideoEditor.tsx';
import { PHONE_ZOOM } from '../src/phone/video/scrub-math.ts';
import { transports } from './video-fakes.ts';
import { pointer } from './phone-media.ts';
import { screen } from './live-screen.ts';

vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : () => {}),
  set: () => true,
});

const rect = (w: number, h: number) => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => {} });
const realRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  transports.length = 0;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
  HTMLElement.prototype.setPointerCapture = (() => {}) as never;
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
  // jsdom has no layout: the timeline is 400 px wide, the picture 640 x 360 (a 1280 x 720 frame at half size).
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const c = this.className?.toString() ?? '';
    if (/\bpv-tl\b|\bpv-tl-surface\b/.test(c)) return rect(400, 200);
    if (/\bpv-frame\b|\bpv-gesture\b/.test(c)) return rect(640, 360);
    return realRect.call(this);
  };
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.getBoundingClientRect = realRect;
});

const video = (name = 'talk.mp4') => new File(['x'], name, { type: 'video/mp4' });
const picture = (name = 'logo.png') => new File(['x'], name, { type: 'image/png' });

async function open() {
  render(<PhoneVideo store={null} />);
  await act(async () => {});
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Choose a video'), { target: { files: [video()] } });
  });
  await waitFor(() => expect(screen.getByTestId('phone-timeline')).toBeTruthy());
}
const strip = () => within(screen.getByRole('toolbar', { name: 'Video tools' }));
const stripNames = () => [...screen.getByRole('toolbar', { name: 'Video tools' }).querySelectorAll('button')].map((b) => b.textContent);
const click = async (name: string | RegExp, scope: { getByRole: typeof screen.getByRole } = screen) => {
  await act(async () => {
    fireEvent.click(scope.getByRole('button', { name }));
  });
};
const surface = () => document.querySelector('.pv-tl-surface') as HTMLElement;
const previewSurface = () => screen.getByTestId('preview-surface');
const MAIN_Y = 24 + 20; // ruler + a bit into the main track (no lane rows yet)
const content = () => document.querySelector('.pv-tl-content') as HTMLElement;
const timeText = () => screen.getByLabelText('Time').textContent;
const tap = (el: Element, x: number, y: number) => {
  pointer(el, 'pointerdown', 1, x, y);
  pointer(el, 'pointerup', 1, x, y);
};
const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe('phone Video editor', () => {
  it('starts with a big "Choose a video" and no timeline', async () => {
    render(<PhoneVideo store={null} />);
    await act(async () => {});
    expect(screen.getByLabelText('Choose a video')).toBeTruthy();
    expect(screen.queryByTestId('phone-timeline')).toBeNull();
  });

  it('opens a video into preview, transport, centre-playhead timeline and the project strip', async () => {
    await open();
    expect(screen.getByTestId('phone-preview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(document.querySelector('.pv-playhead')).toBeTruthy();
    expect(stripNames()).toEqual(['Edit', 'Audio', 'Text', 'Overlay', 'Effects', 'Transitions', 'Ratio', 'Captions', 'Voice']);
    expect(content().getAttribute('data-px-per-second')).toBe(String(PHONE_ZOOM));
  });

  it.each([
    ['Edit', 'Edit'],
    ['Audio', 'Audio'],
    ['Text', 'Text'],
    ['Overlay', 'Overlay'],
    ['Effects', 'Effects'],
    ['Ratio', 'Ratio'],
    ['Captions', 'Captions'],
  ])('the %s tool opens ONE sheet, and tapping it again closes it', async (label, title) => {
    await open();
    await click(new RegExp(`^${label}$`), strip());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    expect(document.querySelector('.pv')!.className).toContain('has-sheet');
    // another tool replaces it: still one sheet
    const other = label === 'Audio' ? 'Edit' : 'Audio';
    await click(new RegExp(`^${other}$`), strip());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: other })).toBeTruthy();
    await click(new RegExp(`^${other}$`), strip());
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
  });

  it('Transitions is off with one clip; Done closes a sheet', async () => {
    await open();
    expect((screen.getByRole('button', { name: 'Transitions' }) as HTMLButtonElement).disabled).toBe(true);
    await click(/^Ratio$/, strip());
    await click('Done');
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
  });

  it('the Ratio sheet changes the picture shape and the chip says it', async () => {
    await open();
    await click(/Picture ratio Original/);
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: '9:16' }));
    });
    expect(screen.getByRole('button', { name: /Picture ratio 9:16/ })).toBeTruthy();
    expect((screen.getByTestId('phone-preview').querySelector('.pv-frame') as HTMLElement).style.getPropertyValue('--ar')).toBe(String(720 / 1280));
  });

  it('a tap on the clip selects it and the strip becomes the clip strip; a tap on the empty picture goes back', async () => {
    await open();
    tap(surface(), 200, MAIN_Y);
    expect(stripNames()).toEqual(['Split', 'Speed', 'Volume', 'Animate', 'Effects', 'Delete']);
    expect(document.querySelector('.pv-clip.is-selected')).toBeTruthy();
    // the trim handles show at both ends, 44 px wide
    expect(document.querySelector('.pv-trim[data-edge="start"]')).toBeTruthy();
    expect(document.querySelector('.pv-trim[data-edge="end"]')).toBeTruthy();
    tap(previewSurface(), 10, 10);
    expect(stripNames()[0]).toBe('Edit');
    expect(document.querySelector('.pv-trim')).toBeNull();
  });

  it.each([
    ['Speed', 'Speed'],
    ['Volume', 'Volume'],
    ['Animate', 'Animate'],
    ['Effects', 'Effects'],
  ])('with a clip picked, %s opens its sheet', async (label, title) => {
    await open();
    tap(surface(), 200, MAIN_Y);
    await click(new RegExp(`^${label}$`), strip());
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    if (label === 'Speed') expect(screen.getByRole('group', { name: 'Speed presets' })).toBeTruthy();
    if (label === 'Volume') expect(screen.getByLabelText('Fade in')).toBeTruthy();
    if (label === 'Effects') expect(screen.getByRole('radiogroup', { name: 'Fit' })).toBeTruthy();
    if (label === 'Animate') expect(screen.getByText(/add it as an Overlay/)).toBeTruthy();
  });

  it('a speed change on the picked clip changes its length on the timeline, as one undo step', async () => {
    await open();
    tap(surface(), 200, MAIN_Y);
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('60s');
    await click(/^Speed$/, strip());
    await click('2x', within(screen.getByRole('group', { name: 'Speed presets' })) as never);
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('30s');
    await click('Undo');
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('60s');
  });

  it('Delete is off for the only clip', async () => {
    await open();
    tap(surface(), 200, MAIN_Y);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Add text from the Text sheet picks the new text, shows the text strip and starts typing', async () => {
    await open();
    await click(/^Text$/, strip());
    await click(/Add text/);
    await waitFor(() => expect(stripNames()).toEqual(['Edit', 'Style', 'Animate', 'Translate', 'Duplicate', 'Delete']));
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0)); // a new selection closes the sheet of the old one
    await waitFor(() => expect(screen.getByLabelText('Type on the picture')).toBeTruthy());
    expect(document.querySelector('.pv-bar-text')).toBeTruthy(); // a coloured bar above the main track
  });

  it('the text Style sheet has Font / Style / Effects / Animation tabs, and Done closes it', async () => {
    await open();
    await click(/^Text$/, strip());
    await click(/Add text/);
    await waitFor(() => expect(stripNames()).toContain('Style'));
    await click(/^Style$/, strip());
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Font', 'Style', 'Effects', 'Animation']);
    expect(screen.getByRole('slider', { name: 'Size' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    });
    expect(screen.getByRole('group', { name: 'Styles' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Animation' }));
    });
    expect(screen.getByRole('radiogroup', { name: 'In animation' })).toBeTruthy();
    await click('Done');
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
  });

  it('the keyframe diamond keys the picked layer at the playhead and a second press takes the keys off', async () => {
    await open();
    expect((screen.getByRole('button', { name: 'Add keyframe' }) as HTMLButtonElement).disabled).toBe(true);
    await click(/^Text$/, strip());
    await click(/Add text/);
    await waitFor(() => expect(stripNames()).toContain('Style'));
    await click('Add keyframe');
    expect(screen.getByRole('button', { name: 'Remove keyframe' }).getAttribute('aria-pressed')).toBe('true');
    await click('Remove keyframe');
    expect(screen.getByRole('button', { name: 'Add keyframe' })).toBeTruthy();
  });

  it('swiping the timeline scrubs: the content slides under the fixed playhead (dragging left moves later)', async () => {
    await open();
    expect(timeText()).toContain('0:00.0');
    pointer(surface(), 'pointerdown', 1, 300, 60);
    pointer(surface(), 'pointermove', 1, 250, 60);
    pointer(surface(), 'pointermove', 1, 204, 60); // 96 px left = 2 s at 48 px per second
    pointer(surface(), 'pointerup', 1, 204, 60);
    expect(timeText()).toContain('0:02.0');
    // the content is offset by centre - time * zoom
    expect(content().style.transform).toContain(`translate3d(${200 - 2 * PHONE_ZOOM}px`);
    expect(transports[0]!.seeks.at(-1)).toBeCloseTo(2, 6);
    // and the other way
    pointer(surface(), 'pointerdown', 1, 200, 60);
    pointer(surface(), 'pointermove', 1, 230, 60);
    pointer(surface(), 'pointermove', 1, 248, 60); // 48 px right = 1 s earlier
    pointer(surface(), 'pointerup', 1, 248, 60);
    expect(timeText()).toContain('0:01.0');
  });

  it('a pinch on the timeline zooms about the playhead and leaves the time alone', async () => {
    await open();
    pointer(surface(), 'pointerdown', 1, 150, 60);
    pointer(surface(), 'pointerdown', 2, 250, 60);
    pointer(surface(), 'pointermove', 2, 350, 60); // the fingers are twice as far apart
    pointer(surface(), 'pointerup', 2, 350, 60);
    pointer(surface(), 'pointerup', 1, 150, 60);
    expect(content().getAttribute('data-px-per-second')).toBe(String(PHONE_ZOOM * 2));
    expect(timeText()).toContain('0:00.0');
  });

  it('dragging the end handle of the picked clip trims it (one undo step), and the start handle trims the start', async () => {
    await open();
    tap(surface(), 200, MAIN_Y);
    const end = document.querySelector('.pv-trim[data-edge="end"]') as HTMLElement;
    pointer(end, 'pointerdown', 1, 3000, 40);
    pointer(end, 'pointermove', 1, 3000 - 96, 40); // 2 s shorter
    pointer(end, 'pointerup', 1, 3000 - 96, 40);
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('58s');
    const start = document.querySelector('.pv-trim[data-edge="start"]') as HTMLElement;
    pointer(start, 'pointerdown', 1, 200, 40);
    pointer(start, 'pointermove', 1, 200 + 48, 40); // 1 s off the start
    pointer(start, 'pointerup', 1, 200 + 48, 40);
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('57s');
    await click('Undo');
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('58s');
    await click('Undo');
    expect(document.querySelector('.pv-clip-len')!.textContent).toBe('60s');
  });

  it('a long press then a drag reorders the main clips; a "+" between them opens the transition sheet', async () => {
    await open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a video, picture or sound'), { target: { files: [video('second.mp4')] } });
    });
    await waitFor(() => expect(document.querySelectorAll('.pv-clip')).toHaveLength(2));
    const order = () => [...document.querySelectorAll('.pv-clip')].map((c) => c.getAttribute('data-item'));
    const [a, b] = order();
    // adding a clip moved the playhead to its start (60 s); hold on the first clip, 100 px (2 s) left of the join
    tap(previewSurface(), 10, 10);
    pointer(surface(), 'pointerdown', 1, 100, MAIN_Y);
    const seeking = timeText();
    expect(seeking).toBeTruthy();
    await sleep(520); // the long press
    expect(document.querySelector('.pv-clip.is-lifted')).toBeTruthy();
    // the finger goes to 100 s: past the middle of the second clip (90 s)
    const to = 200 + 40 * 48;
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: to, clientY: MAIN_Y, bubbles: true }), { pointerId: 1 }));
    window.dispatchEvent(Object.assign(new MouseEvent('pointerup', { clientX: to, clientY: MAIN_Y, bubbles: true }), { pointerId: 1 }));
    await act(async () => {});
    expect(order()).toEqual([b, a]);
    expect(document.querySelector('.pv-clip.is-lifted')).toBeNull();
    // one undo step brings the order back
    await click('Undo');
    expect(order()).toEqual([a, b]);
    // the join's "+"
    await click(/Transition between clip 1 and clip 2/);
    expect(screen.getByRole('dialog', { name: 'Transitions' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Transition' })).toBeTruthy();
  });

  it('an overlay picture: drag moves it, pinch resizes it, twist turns it (all in the preview), and the strip is the picture strip', async () => {
    await open();
    await click(/^Overlay$/, strip());
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a picture or video over the video'), { target: { files: [picture()] } });
    });
    await waitFor(() => expect(screen.getByTestId('phone-box')).toBeTruthy());
    expect(stripNames()).toEqual(['Effects', 'Animate', 'Opacity', 'Speed', 'Volume', 'Duplicate', 'Delete']);
    const box = () => screen.getByTestId('phone-box') as HTMLElement;
    // 800 x 600 into a 1280 x 720 frame at half size: 480 x 360, centred
    expect(box().style.width).toBe('37.5%');
    expect(box().style.left).toBe('31.25%');
    // a drag of 40 screen px = 80 frame px
    pointer(previewSurface(), 'pointerdown', 1, 320, 180);
    pointer(previewSurface(), 'pointermove', 1, 340, 180);
    pointer(previewSurface(), 'pointermove', 1, 360, 180);
    pointer(previewSurface(), 'pointerup', 1, 360, 180);
    expect(box().style.left).toBe(`${((400 + 80) / 1280) * 100}%`);
    // pinch to twice the size
    pointer(previewSurface(), 'pointerdown', 1, 300, 100);
    pointer(previewSurface(), 'pointerdown', 2, 340, 100);
    pointer(previewSurface(), 'pointermove', 2, 380, 100);
    pointer(previewSurface(), 'pointerup', 2, 380, 100);
    pointer(previewSurface(), 'pointerup', 1, 300, 100);
    expect(box().style.width).toBe('75%');
    // twist a quarter turn
    pointer(previewSurface(), 'pointerdown', 1, 300, 100);
    pointer(previewSurface(), 'pointerdown', 2, 340, 100);
    pointer(previewSurface(), 'pointermove', 2, 300, 140);
    pointer(previewSurface(), 'pointerup', 2, 300, 140);
    pointer(previewSurface(), 'pointerup', 1, 300, 100);
    expect(box().style.transform).toBe('rotate(90deg)');
    // each of those was ONE undo step: three undos take the layer back to where it began
    await click('Undo');
    await click('Undo');
    await click('Undo');
    expect(box().style.width).toBe('37.5%');
    expect(box().style.left).toBe('31.25%');
    // a corner handle is 44 px (see phone-video.css) and resizes proportionally
    const h = box().querySelector('[data-handle="se"]') as HTMLElement;
    expect(h).toBeTruthy();
  });

  it('the Overlay sheet offers uploads, and Effects with nothing picked lists what can be adjusted', async () => {
    await open();
    await click(/^Overlay$/, strip());
    expect(screen.getByRole('button', { name: /From your uploads/ })).toBeTruthy();
    await click(/^Effects$/, strip());
    expect(screen.getByText(/The clip at the playhead/)).toBeTruthy();
  });

  it('Voice shows the read-aloud tool or says this phone has no voice', async () => {
    await open();
    await click(/^Voice$/, strip());
    expect(screen.getByRole('dialog', { name: 'Read aloud' })).toBeTruthy();
    expect(screen.getByText(/no voice|Each text is spoken/)).toBeTruthy();
  });
});

describe('the desktop editor is not the phone editor', () => {
  it('renders its own page, with no phone parts', async () => {
    render(<VideoEditor store={null} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Video editor' })).toBeTruthy();
    expect(document.querySelector('.pv')).toBeNull();
    expect(document.querySelector('.editor-page')).toBeTruthy();
  });
});
