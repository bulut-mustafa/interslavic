// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { tidy, TESSERACT_LANG, type Recognizer } from '../src/photo/ocr.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

/** jsdom has no canvas or image decoding, so both are stood in for here. */
const ctx = fakeContext();

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); } as never;
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/jpeg;base64,AAAA') as never;
  URL.createObjectURL = () => 'blob:pic';
  URL.revokeObjectURL = () => {};
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ocr = (lines: { text: string; confidence?: number }[], langs: string[] = []): Recognizer => ({
  recognize: async (_b, lang, onProgress) => {
    langs.push(lang);
    onProgress(1, 'done');
    return {
      text: lines.map((l) => l.text).join('\n'),
      confidence: 90,
      lines: lines.map((l, i) => ({ text: l.text, confidence: l.confidence ?? 90, bbox: { x0: 50, y0: 50 + i * 80, x1: 450, y1: 110 + i * 80 } })),
    };
  },
});

async function open(r: Recognizer) {
  render(<PhotoEditor recognizer={r} />);
  fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [new File(['x'], 'sign.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await act(async () => {}); // the words are read as soon as the picture opens
}

const textBox = () => screen.getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement;
/** The page being shown: the others stay open but hidden, with the same controls in them. */
const pane = () => document.querySelector('.photo-page:not([hidden])') as HTMLElement;
const lines = () => [...pane().querySelectorAll('.live-line')] as HTMLElement[];
const bands = () => [...pane().querySelectorAll('.live-band')] as HTMLElement[];
/** jsdom's pointer events carry no coordinates, so mouse events named like them stand in. */
const pointer = (target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
/** Drag from one point of the picture to another, the way a person would. */
const drag = async (from: [number, number], to: [number, number], line = 0) => {
  pointer(lines()[line]!, 'pointerdown', ...from);
  pointer(pane().querySelector('.live-layer')!, 'pointermove', ...to);
  pointer(pane().querySelector('.live-layer')!, 'pointerup', ...to);
  await act(async () => {});
};
const pickAll = () => fireEvent.keyDown(pane().querySelector('.canvas-wrap')!, { key: 'a', ctrlKey: true });
/** Picks one word the way a person would, by double-clicking it. */
const pickWord = async (line = 0, x = 100) => {
  fireEvent.doubleClick(lines()[line]!, { clientX: x, clientY: 80 + line * 80 });
  await act(async () => {});
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const fakeTranslator = (calls: string[][] = []) =>
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
    const { lines } = JSON.parse(init.body) as { lines: string[] };
    calls.push(lines);
    return { ok: true, status: 200, json: async () => ({ results: lines.map((l) => ({ text: `ISV ${l}`, flagged: l === 'Exit', reasons: [] })) }) };
  }));

describe('tidy and the language names', () => {
  it('joins the lines of a paragraph', () => {
    expect(tidy('Good\nmorning to\nall.\n\nSecond para-\ngraph here.')).toBe('Good morning to all.\n\nSecond paragraph here.');
  });
  it('names the OCR languages the way the reader does', () => {
    expect(TESSERACT_LANG).toEqual({ en: 'eng', ru: 'rus', uk: 'ukr' });
  });
});

describe('the photo editor', () => {
  it('starts with only the place to open a picture, and says the picture stays on the device', () => {
    render(<PhotoEditor />);
    expect(screen.getByLabelText('Photo')).toBeTruthy();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.body.textContent).toContain('stays on your device');
  });

  it('makes room once a picture is open: the explainer and the big upload box go, a small Open another stays', async () => {
    render(<PhotoEditor />);
    expect(document.querySelector('.dropzone')).toBeTruthy();
    expect(document.querySelector('.lesson-summary')).toBeTruthy();
    cleanup();
    await open(ocr([]));
    expect(document.querySelector('.dropzone')).toBeNull();
    expect(document.querySelector('.lesson-summary')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByText('Add picture')).toBeTruthy();
  });

  it('opens a made-up sample picture for people with no photo to hand', async () => {
    render(<PhotoEditor recognizer={ocr([])} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try a sample picture' }));
    });
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  });

  it('refuses a file that is not a picture', async () => {
    render(<PhotoEditor />);
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [new File(['x'], 'a.mp3', { type: 'audio/mpeg' })] } });
    expect(screen.getByRole('alert').textContent).toBe('That file is not a picture.');
  });

  describe('reading the text', () => {
    it('reads the words as soon as the picture opens, in the chosen language, and changes nothing', async () => {
      const langs: string[] = [];
      await open(ocr([{ text: 'Hello there' }, { text: 'Exit' }], langs));
      expect(langs).toEqual(['en']);
      expect(lines()).toHaveLength(2);
      expect(screen.getByText(/Text found/)).toBeTruthy();
      expect(bands()).toHaveLength(0); // nothing is highlighted until the user drags over it
      expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull(); // nothing chosen, nothing offered
      expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true); // and nothing changed
    });

    it('reads again in another language when it is chosen', async () => {
      const langs: string[] = [];
      await open(ocr([{ text: 'Hello' }], langs));
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Language of the text in the photo'), { target: { value: 'ru' } });
      });
      expect(langs).toEqual(['en', 'ru']);
    });

    it('says plainly when no text was found, and leaves out words the reader was unsure of', async () => {
      await open(ocr([]));
      expect(screen.getByText(/No text found/)).toBeTruthy();
      cleanup();
      await open(ocr([{ text: 'Sure' }, { text: 'unsure', confidence: 10 }]));
      expect(lines()).toHaveLength(1);
    });

    it('shows when reading fails, and reads again on request', async () => {
      let tries = 0;
      const flaky: Recognizer = {
        recognize: async (_b, _l, onProgress) => {
          if (tries++ === 0) throw new Error('model could not be loaded');
          onProgress(1, 'done');
          return { text: 'Hi', confidence: 90, lines: [{ text: 'Hi', confidence: 90, bbox: { x0: 10, y0: 10, x1: 90, y1: 50 } }] };
        },
      };
      await open(flaky);
      expect(screen.getByRole('alert').textContent).toContain('model could not be loaded');
      await click('Try again');
      expect(lines()).toHaveLength(1);
    });
  });

  describe('picking text', () => {
    it('picks nothing from a click or a hover alone: the user starts and ends the selection', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      pointer(lines()[0]!, 'pointerdown', 100, 80);
      pointer(pane().querySelector('.live-layer')!, 'pointerup', 100, 80);
      await act(async () => {});
      expect(bands()).toHaveLength(0);
      expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull();
    });

    it('picks exactly what is dragged over, from where it starts to where it ends, even part of a word', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await drag([60, 80], [150, 80]);
      expect(textBox().value).toBe('He');
      expect(screen.getByRole('toolbar', { name: 'Selected text' })).toBeTruthy();
    });

    it('picks the same whichever way it is dragged', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await drag([150, 80], [60, 80]);
      expect(textBox().value).toBe('He');
    });

    it('shows what is picked as one unbroken band for each line, not a box for each word', async () => {
      await open(ocr([{ text: 'Hello there' }, { text: 'Exit' }]));
      await drag([60, 80], [400, 80]);
      expect(bands()).toHaveLength(1); // two words, one band
      expect(textBox().value).toBe('Hello ther'); // up to the gap the pointer was nearest to
      await drag([300, 80], [200, 160]);
      expect(bands()).toHaveLength(2); // a drag down onto the next line: a band on each
    });

    it('picks a word by double-clicking it, and a line by clicking three times', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord(0, 100);
      expect(textBox().value).toBe('Hello');
      fireEvent.click(lines()[0]!, { detail: 3, clientX: 100, clientY: 80 });
      await act(async () => {});
      expect(textBox().value).toBe('Hello there');
    });

    it('picks everything with Control or Command A, and clears with Escape', async () => {
      await open(ocr([{ text: 'Hello there' }, { text: 'Exit' }]));
      pickAll();
      expect(bands()).toHaveLength(2);
      expect(screen.getByText(/2 lines selected/)).toBeTruthy();
      fireEvent.keyDown(pane().querySelector('.canvas-wrap')!, { key: 'Escape' });
      expect(bands()).toHaveLength(0);
      expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull();
    });

    it('offers a way to pick all the text without a keyboard', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await click('Select all text');
      expect(textBox().value).toBe('Hello there');
    });
  });

  describe('changing what was picked', () => {
    it('translates only the chosen words, and leaves the others as they were', async () => {
      const calls: string[][] = [];
      fakeTranslator(calls);
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      await click('Translate');
      expect(calls).toEqual([['Hello']]);
      expect(textBox().value).toBe('ISV Hello');
      await pickWord(0, 400);
      expect(textBox().value).toBe('there'); // 'there' is still the picture's own text, and can be picked; 'Hello' is now a text layer
      expect(screen.getByText(/Translated 1 line into Interslavic/)).toBeTruthy();
    });

    it('translates several lines at once, and says when the translator doubted one', async () => {
      const calls: string[][] = [];
      fakeTranslator(calls);
      await open(ocr([{ text: 'Hello there' }, { text: 'Exit' }]));
      pickAll();
      await click('Translate');
      expect(calls).toEqual([['Hello there', 'Exit']]);
      expect(screen.getByText(/Translated 2 lines into Interslavic\. 1 may be wrong/)).toBeTruthy();
    });

    it('brings the picture\'s own words back when the original is restored, not a re-drawn copy', async () => {
      fakeTranslator();
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      await click('Translate');
      await click('Restore original');
      expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull();
      await pickWord(0, 100);
      expect(textBox().value).toBe('Hello'); // the layer is gone and the picture's own word is back to be picked
    });

    it('undoes a translation in one step', async () => {
      fakeTranslator();
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      await click('Translate');
      await click('Undo');
      expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
      await pickWord(0, 100);
      expect(textBox().value).toBe('Hello');
    });

    it('makes a layer of the words the first time one is retyped, in one undo step', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord(0, 400);
      fireEvent.change(textBox(), { target: { value: 'tamo' } });
      expect(textBox().value).toBe('tamo');
      await click('Undo');
      expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
      await pickWord(0, 400);
      expect(textBox().value).toBe('there');
    });

    it('restyles only what is picked: a preset and a size change make a layer of it', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      const size = () => Number((screen.getByLabelText('Size', { selector: 'input' }) as HTMLInputElement).value);
      const before = size();
      await click('Larger text');
      expect(size()).toBeGreaterThan(before);
      // 'Neon' is also a text effect (the effects panel under the text controls): the look preset is the first one in the panel.
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Neon' })[0]!);
      });
      expect((screen.getByLabelText('Glow') as HTMLInputElement).checked).toBe(true);
    });

    it('types on the picture itself, and Escape ends it', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      await click('Edit');
      const box = screen.getByLabelText('Type on the picture', { selector: 'textarea' }) as HTMLTextAreaElement;
      fireEvent.change(box, { target: { value: 'Zdravo' } });
      expect(textBox().value).toBe('Zdravo');
      fireEvent.keyDown(box, { key: 'Escape' });
      expect(screen.queryByLabelText('Type on the picture', { selector: 'textarea' })).toBeNull();
    });

    it('shows a translator failure without losing the text', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      await click('Translate');
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not answering'), { timeout: 15000 });
      expect(textBox().value).toBe('Hello');
    }, 20000);
  });

  describe('text added by hand', () => {
    it('adds text, which can be edited, undone and redone', async () => {
      await open(ocr([]));
      await click('Add text');
      expect(textBox().value).toBe('Your text');
      fireEvent.change(textBox(), { target: { value: 'one' } });
      await click('Undo');
      expect(textBox().value).toBe('Your text');
      await click('Redo');
      expect(textBox().value).toBe('one');
    });

    it('duplicates and deletes a layer', async () => {
      await open(ocr([]));
      await click('Add text');
      await click('Duplicate');
      fireEvent.change(textBox(), { target: { value: 'copy' } });
      await click('Undo');
      expect(textBox().value).toBe('Your text');
      await click('Delete');
      expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull();
    });
  });

  describe('pages', () => {
    const tiles = () => [...document.querySelectorAll('.page-tile')] as HTMLElement[];
    const add = (...files: File[]) => fireEvent.change(screen.getByLabelText('Photo'), { target: { files } });
    const another = (name: string) => new File([name], name, { type: 'image/png' });
    const later = async () => {
      await act(async () => {});
      await act(async () => {});
    };

    it('starts with one page, and a place to add more', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      expect(tiles()).toHaveLength(1);
      expect(tiles()[0]!.getAttribute('aria-label')).toBe('Page 1: sign.png');
      expect(tiles()[0]!.getAttribute('aria-current')).toBe('page');
    });

    it('adds another picture as a new page, and keeps the first page with its changes while the other is shown', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      fireEvent.change(textBox(), { target: { value: 'changed' } });
      add(another('second.png'));
      await later();
      expect(tiles()).toHaveLength(2);
      expect(tiles()[1]!.getAttribute('aria-current')).toBe('page');
      expect(screen.queryByRole('alertdialog')).toBeNull(); // nothing asks before moving on: the first page is kept
      fireEvent.click(tiles()[0]!);
      await later();
      expect(tiles()[0]!.getAttribute('aria-current')).toBe('page');
      expect(textBox().value).toBe('changed'); // exactly as it was left, selection and all
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await pickWord();
      expect(textBox().value).toBe('Hello'); // and its own undo history came with it
    });

    it('gives each page its own text and history', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      add(another('second.png'));
      await later();
      await pickWord();
      fireEvent.change(textBox(), { target: { value: 'two' } });
      fireEvent.click(tiles()[0]!);
      await later();
      expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true); // page 1 was never changed
    });

    it('goes to the page of a picture that is already open instead of adding it twice', async () => {
      await open(ocr([{ text: 'Hello' }]));
      const two = another('second.png');
      add(two);
      await later();
      add(two);
      await later();
      expect(tiles()).toHaveLength(2);
      expect(tiles()[1]!.getAttribute('aria-current')).toBe('page');
    });

    it('takes several pictures at once, and says when one is not a picture', async () => {
      await open(ocr([]));
      add(another('b.png'), another('c.png'), new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
      await later();
      expect(tiles()).toHaveLength(3);
      expect(screen.getByRole('alert').textContent).toBe('One file was not a picture.');
    });

    it('removes a page with no changes at once, and asks first when it has some', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      add(another('second.png'));
      await later();
      fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
      await later();
      expect(tiles()).toHaveLength(1); // nothing to lose: gone at once
      await pickWord();
      fireEvent.change(textBox(), { target: { value: 'changed' } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400)); // the strip learns of the change a moment later
      });
      fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
      expect(screen.getByRole('alertdialog').textContent).toContain('sign.png');
      await click('Keep it');
      expect(tiles()).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
      await click('Remove it');
      await later();
      expect(document.querySelector('.dropzone')).toBeTruthy(); // back to the empty start
    });

    it('keeps a picture in memory only for the page on screen', async () => {
      const calls = { n: 0 };
      const counting: Recognizer = { recognize: async (b, l, p) => (calls.n++, ocr([{ text: 'Hello there' }]).recognize(b, l, p)) };
      render(<PhotoEditor recognizer={counting} />);
      fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [new File(['x'], 'sign.png', { type: 'image/png' })] } });
      await waitFor(() => expect(document.querySelectorAll('.layer-canvas')).toHaveLength(1));
      add(another('b.png'), another('c.png'));
      await later();
      await later();
      expect(tiles()).toHaveLength(3);
      expect(document.querySelectorAll('.layer-canvas')).toHaveLength(1); // three pages, one canvas
      expect(calls.n).toBe(2); // the first and the one on screen; the page between was never looked at, so it is read when it is

      fireEvent.click(tiles()[1]!);
      await later();
      await later();
      expect(calls.n).toBe(3);
      fireEvent.click(tiles()[0]!);
      await later();
      await later();
      expect(document.querySelectorAll('.layer-canvas')).toHaveLength(1); // always one canvas, whichever page is shown
      expect(pane().querySelector('.layer-canvas')).toBeTruthy();
      expect(calls.n).toBe(3); // coming back on screen did not read the text again
    });

    it('brings a page back from memory with its text, its selection tools and its history', async () => {
      await open(ocr([{ text: 'Hello there' }]));
      await pickWord();
      fireEvent.change(textBox(), { target: { value: 'changed' } });
      add(another('second.png'));
      await later();
      await later();
      expect(document.querySelectorAll('.layer-canvas')).toHaveLength(1);
      fireEvent.click(tiles()[0]!);
      await later();
      await later();
      expect(textBox().value).toBe('changed'); // its picture was let go and loaded again; the work was never lost
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await pickWord(0, 400);
      expect(textBox().value).toBe('there');
    });

    it('saves all the pages as one zip, each picture named after its original', async () => {
      // jsdom's Blob cannot be read back with arrayBuffer(), which real browsers can
      Blob.prototype.arrayBuffer ??= function (this: Blob) {
        return new Promise<ArrayBuffer>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as ArrayBuffer);
          r.readAsArrayBuffer(this);
        });
      };
      let name = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        name = this.download;
      });
      await open(ocr([]));
      await click('Save picture');
      expect(screen.queryByRole('radio', { name: /pages as a zip/ })).toBeNull(); // one page: nothing to choose between
      await click('Cancel');
      add(another('second.png'));
      await later();
      await click('Save picture');
      await act(async () => {
        fireEvent.click(screen.getByRole('radio', { name: 'All 2 pages as a zip' }));
      }); // downloading many pages is a choice in the download window
      await click('Download');
      await waitFor(() => expect(name).toBe('edited-pictures.zip'));
    });
  });

  it('saves the picture as a PNG named after the original', async () => {
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    await open(ocr([]));
    await click('Save picture'); // opens the download window, which asks the format and size
    await click('Download');
    await waitFor(() => expect(name).toBe('sign-edited.png'));
  });
});
