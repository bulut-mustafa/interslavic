// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, waitFor } from '@testing-library/react';
import CutoutDialog, { type CutoutDeps, type CutoutOutput } from '../src/photo/CutoutDialog.tsx';
import { newMatte, type Rgba } from '../src/photo/cutout.ts';
import type { Cutout, Options } from '../src/photo/cutout-client.ts';
import { screen } from './live-screen.ts';

// jsdom has no 2D canvas: say so quietly instead of logging "not implemented" at every draw.
beforeEach(() => void vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cv = (w = 8, h = 4) => ({ width: w, height: h, getContext: () => null }) as unknown as HTMLCanvasElement;
const result = (): Cutout => {
  const matte = newMatte(8, 4);
  for (let y = 0; y < 4; y++) for (let x = 2; x < 6; x++) matte.data[y * 8 + x] = 255;
  return { matte, picture: cv(), cutout: cv(), width: 8, height: 4, scale: 0.5 };
};
const pic = (w: number, h: number): Rgba => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) });

function deps(extra: Partial<CutoutDeps> = {}): CutoutDeps {
  return {
    run: async (_src, o?: Options) => {
      o?.onStage?.({ kind: 'model', fraction: 0.5 });
      return result();
    },
    readRgba: (c) => pic(c.width, c.height),
    shrink: (_c, w, h) => pic(w, h),
    toCanvas: (p) => cv(p.w, p.h),
    toPng: async () => new Blob(['png'], { type: 'image/png' }),
    ...extra,
  };
}

describe('the cut-out dialog', () => {
  it('asks first: says the size, where it comes from and that nothing is uploaded, and does nothing until told', () => {
    const run = vi.fn();
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={vi.fn()} onClose={vi.fn()} deps={deps({ run })} />);
    expect(screen.getByText(/never uploaded/i)).toBeTruthy();
    expect(screen.getByText(/huggingface\.co/)).toBeTruthy();
    expect(screen.getAllByText(/6\.6 MB/).length).toBe(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('names the second model with its download size', () => {
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={vi.fn()} onClose={vi.fn()} deps={deps()} />);
    fireEvent.click(screen.getByLabelText(/Better - any subject/));
    expect(screen.getAllByText(/192 MB/).length).toBe(2);
  });

  it('shows progress with a Cancel that aborts the run', async () => {
    let signal: AbortSignal | undefined;
    const run = async (_s: unknown, o?: Options) => {
      signal = o?.signal;
      o?.onStage?.({ kind: 'model', fraction: 0.4 });
      return new Promise<Cutout>((_, rej) => o?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))));
    };
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={vi.fn()} onClose={vi.fn()} deps={deps({ run })} />);
    fireEvent.click(screen.getByText(/Download and remove/));
    await waitFor(() => expect(screen.getByText('Getting the model… 40%')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByText(/Download and remove/)).toBeTruthy());
  });

  it('says what went wrong in plain words and lets the person try again', async () => {
    const run = async () => {
      throw new Error('Failed to fetch');
    };
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={vi.fn()} onClose={vi.fn()} deps={deps({ run })} />);
    fireEvent.click(screen.getByText(/Download and remove/));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be downloaded/));
    expect(screen.getByText(/Download and remove/)).toBeTruthy();
  });

  it('keeps the cut-out as a picture layer, trimmed to the subject, with where it sits', async () => {
    const onKeep = vi.fn();
    render(<CutoutDialog source={new Blob(['x'])} onKeep={onKeep} onReplace={vi.fn()} onClose={vi.fn()} deps={deps()} />);
    fireEvent.click(screen.getByText(/Download and remove/));
    await waitFor(() => expect(screen.getByText('Keep as picture layer')).toBeTruthy());
    fireEvent.click(screen.getByText('Keep as picture layer'));
    await waitFor(() => expect(onKeep).toHaveBeenCalled());
    const out = onKeep.mock.calls[0]![0] as CutoutOutput;
    expect(out.box).toEqual({ x: 2, y: 0, w: 4, h: 4 });
    expect(out.scale).toBe(0.5);
    expect(out.png.type).toBe('image/png');
  });

  it('replaces the background with the whole-picture cut-out', async () => {
    const onReplace = vi.fn();
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={onReplace} onClose={vi.fn()} deps={deps()} />);
    fireEvent.click(screen.getByText(/Download and remove/));
    await waitFor(() => screen.getByText('Replace the background'));
    fireEvent.click(screen.getByText('Replace the background'));
    await waitFor(() => expect(onReplace).toHaveBeenCalled());
    expect((onReplace.mock.calls[0]![0] as CutoutOutput).box).toEqual({ x: 0, y: 0, w: 8, h: 4 });
  });

  it('applies brush strokes to the result: an erase stroke across the subject empties it', async () => {
    const onKeep = vi.fn();
    const onClose = vi.fn();
    render(<CutoutDialog source={new Blob(['x'])} onKeep={onKeep} onReplace={vi.fn()} onClose={onClose} deps={deps()} />);
    fireEvent.click(screen.getByText(/Download and remove/));
    await waitFor(() => screen.getByLabelText(/Preview of the cut-out/));
    const c = screen.getByLabelText(/Preview of the cut-out/) as HTMLCanvasElement;
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 8, height: 4, right: 8, bottom: 4, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.change(screen.getByLabelText('Brush size'), { target: { value: '80' } });
    const down = createEvent.pointerDown(c, { pointerId: 1 });
    // jsdom has no PointerEvent, so the coordinates are put on the event by hand.
    Object.defineProperties(down, { clientX: { value: 4 }, clientY: { value: 2 } });
    fireEvent(c, down);
    fireEvent.pointerUp(c, { pointerId: 1 });
    fireEvent.click(screen.getByText('Keep as picture layer'));
    await waitFor(() => expect(screen.queryByText(/Download and remove/)).toBeNull());
    // Everything erased: nothing left to trim to, so the whole picture comes back.
    await waitFor(() => expect(onKeep).toHaveBeenCalled());
    expect((onKeep.mock.calls[0]![0] as CutoutOutput).box).toEqual({ x: 0, y: 0, w: 8, h: 4 });
  });

  it('discards, and Escape closes', async () => {
    const onClose = vi.fn();
    render(<CutoutDialog source={new Blob(['x'])} onKeep={vi.fn()} onReplace={vi.fn()} onClose={onClose} deps={deps()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
