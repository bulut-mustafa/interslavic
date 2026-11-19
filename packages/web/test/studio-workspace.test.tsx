// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import App from '../src/App.tsx';
import { kindOf } from '../src/studio/library.tsx';
import { screen } from './live-screen.ts';

// jsdom cannot read or play media: a file name stands for a 60 s video, and the player is a stand-in.
vi.mock('../src/video/sources.ts', async (orig) => (await import('./video-fakes.ts')).fakeSources(await orig()));
vi.mock('../src/video/transport.ts', async (orig) => (await import('./video-fakes.ts')).fakeTransportModule(await orig()));
vi.mock('../src/video/frames.ts', async (orig) => (await import('./video-fakes.ts')).fakeFrames(await orig()));

/** jsdom has no canvas or image decoding, so both are stood in for here. */
const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }), getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) } as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : () => {}),
  set: () => true,
});

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); } as never;
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, parser: true }) })));
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 60 });
  HTMLMediaElement.prototype.play = (() => Promise.resolve()) as never;
  HTMLMediaElement.prototype.pause = (() => {}) as never;
  window.history.replaceState({}, '', '/studio/photo');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const png = (name = 'sign.png') => new File(['x'], name, { type: 'image/png' });
const mp4 = (name = 'clip.mp4') => new File(['x'], name, { type: 'video/mp4' });
const go = async (label: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: label }));
  });
};

async function openPicture(file = png()) {
  // the rail has a link called Photo too, so look inside the tool that is showing
  const pane = document.querySelector('.tool-pane:not([hidden])') as HTMLElement;
  fireEvent.change(within(pane).getByLabelText('Photo'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
}

describe('kindOf', () => {
  it('tells pictures from videos by type, and by extension when there is no type', () => {
    expect(kindOf({ name: 'a.png', type: 'image/png' })).toBe('image');
    expect(kindOf({ name: 'a.mp4', type: 'video/mp4' })).toBe('video');
    expect(kindOf({ name: 'a.MOV', type: '' })).toBe('video');
    expect(kindOf({ name: 'a.jpeg', type: '' })).toBe('image');
    expect(kindOf({ name: 'a.svg', type: '' })).toBe('image');
    expect(kindOf({ name: 'a.txt', type: 'text/plain' })).toBeNull();
    expect(kindOf({ name: 'a.bin', type: '' })).toBeNull();
  });
});

describe('tools keep their work when you go to another tool', () => {
  it('finds a picture, its text and its undo history as they were left', async () => {
    render(<App />);
    await openPicture();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    });
    fireEvent.change(screen.getByLabelText('Text', { selector: 'textarea' }), { target: { value: 'My caption' } });

    await go('Subtitles');
    expect(window.location.pathname).toBe('/studio/subtitles');
    // the photo editor is still there, only hidden
    const photoPane = document.querySelector('.tool-pane:not([hidden])')!;
    expect(photoPane.querySelector('.editor')).toBeNull();
    expect(document.querySelectorAll('.tool-pane')).toHaveLength(2);

    await go('Photo');
    expect((screen.getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement).value).toBe('My caption');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect((screen.getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement).value).toBe('Your text');
  });

  it('keeps what was typed in Subtitles, too', async () => {
    window.history.replaceState({}, '', '/studio/subtitles');
    render(<App />);
    fireEvent.change(screen.getByLabelText('or paste it here'), { target: { value: '1\n00:00:01,000 --> 00:00:02,000\nHi\n' } });
    expect(screen.getByText('1 subtitles found.')).toBeTruthy();
    await go('Photo');
    await go('Subtitles');
    expect(screen.getByText('1 subtitles found.')).toBeTruthy(); // still open, as it was left
  });

  it('mounts a tool only when it is first visited', () => {
    render(<App />);
    expect(document.querySelectorAll('.tool-pane')).toHaveLength(1);
  });

  it('shows only the tool that is current', async () => {
    render(<App />);
    await go('Subtitles');
    const panes = [...document.querySelectorAll('.tool-pane')];
    expect(panes.filter((p) => !p.hasAttribute('hidden'))).toHaveLength(1);
  });

  it('hands a transcript to Subtitles even though it was opened before', async () => {
    window.history.replaceState({}, '', '/studio/subtitles');
    render(<App />);
    await go('Recording');
    // the transcript is sent while Subtitles is hidden
    window.sessionStorage.setItem('interslavic-handoff-srt', JSON.stringify({ srt: '1\n00:00:01,000 --> 00:00:02,000\nArrived\n', lang: 'ru', name: 'talk.srt' }));
    await go('Subtitles');
    await waitFor(() => expect(screen.getByText('talk.srt')).toBeTruthy());
    expect((screen.getByLabelText('Translate from') as HTMLSelectElement).value).toBe('ru'); // the language the Recording page heard, not a guess from the English text
  });
});

/** The Uploads sheet opens from a button in the rail. */
const openSheet = () => {
  if (!screen.queryByRole('complementary', { name: 'Uploads' })) fireEvent.click(screen.getByRole('button', { name: /^Uploads/ }));
  return screen.getByRole('complementary', { name: 'Uploads' });
};

describe('the Uploads sheet', () => {
  it('has a button in the rail on the editors, and not on the other tools', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /^Uploads/ })).toBeTruthy();
    await go('Subtitles');
    expect(screen.queryByRole('button', { name: /^Uploads/ })).toBeNull();
    await go('Video');
    expect(screen.getByRole('button', { name: /^Uploads/ })).toBeTruthy();
  });

  it('is closed until the button is pressed, opens beside the rail, and closes again', () => {
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Uploads' })).toBeNull();
    const button = screen.getByRole('button', { name: /^Uploads/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(screen.getByRole('complementary', { name: 'Uploads' })).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close uploads' }));
    expect(screen.queryByRole('complementary', { name: 'Uploads' })).toBeNull();
  });

  it('starts empty and says how it fills', () => {
    render(<App />);
    expect(within(openSheet()).getByText(/appear here/)).toBeTruthy();
  });

  it('collects what is opened in an editor, once, and marks the one in use', async () => {
    render(<App />);
    const same = png();
    await openPicture(same);
    const sheet = openSheet();
    expect(within(sheet).getByRole('button', { name: 'Open sign.png' })).toBeTruthy();
    expect(sheet.querySelector('li.is-open')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Uploads/ }).textContent).toContain('1'); // the rail says how many
    fireEvent.change(within(sheet).getByLabelText('Add to uploads'), { target: { files: [same] } });
    expect(within(sheet).getAllByRole('button', { name: /^Open / })).toHaveLength(1); // the same file is not added twice
  });

  it('adds pictures and videos dropped or chosen, and says when a file is neither', () => {
    render(<App />);
    const sheet = openSheet();
    fireEvent.change(within(sheet).getByLabelText('Add to uploads'), { target: { files: [png('a.png'), mp4('b.mp4'), new File(['x'], 'c.txt', { type: 'text/plain' })] } });
    expect(within(sheet).getByRole('button', { name: 'Open a.png' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Open b.mp4' })).toBeTruthy();
    expect(within(sheet).getByRole('alert').textContent).toBe('One file was not a picture, a video or a sound.');
  });

  it('opens an uploaded picture in the photo editor with one click', async () => {
    render(<App />);
    const sheet = openSheet();
    fireEvent.change(within(sheet).getByLabelText('Add to uploads'), { target: { files: [png('later.png')] } });
    expect(screen.queryByRole('toolbar', { name: 'Photo tools' })).toBeNull();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Open later.png' }));
    });
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  });

  it('sends a clip to the video editor, going there first, even if that editor was never opened', async () => {
    render(<App />);
    const sheet = openSheet();
    fireEvent.change(within(sheet).getByLabelText('Add to uploads'), { target: { files: [mp4('movie.mp4')] } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Open movie.mp4' }));
    });
    expect(window.location.pathname).toBe('/studio/video');
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Video tools' })).toBeTruthy());
    expect(screen.getByRole('button', { name: /^Clip 1, 1:00/ })).toBeTruthy();
    expect(openSheet().querySelector('li.is-open')).toBeTruthy();
  });

  it('keeps the uploads when moving between the two editors', async () => {
    render(<App />);
    await openPicture(png('keep.png'));
    await go('Video');
    expect(within(openSheet()).getByRole('button', { name: 'Open keep.png' })).toBeTruthy();
  });

  it('removes an upload', () => {
    render(<App />);
    const sheet = openSheet();
    fireEvent.change(within(sheet).getByLabelText('Add to uploads'), { target: { files: [png('gone.png')] } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove gone.png from uploads' }));
    expect(within(sheet).queryByRole('button', { name: 'Open gone.png' })).toBeNull();
  });
});

describe('the rail folds to its icons', () => {
  const rail = () => document.querySelector('.studio') as HTMLElement;

  it('folds and opens again, and remembers the choice', () => {
    window.localStorage.removeItem('studio-rail-collapsed');
    render(<App />);
    expect(rail().className).not.toContain('is-folded');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    expect(rail().className).toContain('is-folded');
    expect(window.localStorage.getItem('studio-rail-collapsed')).toBe('1');
    cleanup();
    render(<App />);
    expect(rail().className).toContain('is-folded'); // still folded on the next visit
    fireEvent.click(screen.getByRole('button', { name: 'Expand the sidebar' }));
    expect(rail().className).not.toContain('is-folded');
    expect(window.localStorage.getItem('studio-rail-collapsed')).toBe('0');
  });

  it('goes to a tool from the folded rail without opening it', async () => {
    window.localStorage.setItem('studio-rail-collapsed', '1');
    render(<App />);
    await go('Video');
    expect(window.location.pathname).toBe('/studio/video');
    expect(rail().className).toContain('is-folded');
    window.localStorage.removeItem('studio-rail-collapsed');
  });

  it('still opens the Uploads sheet from the folded rail', () => {
    window.localStorage.setItem('studio-rail-collapsed', '1');
    render(<App />);
    expect(openSheet()).toBeTruthy();
    window.localStorage.removeItem('studio-rail-collapsed');
  });
});
