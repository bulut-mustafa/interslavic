// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddPanel, onlyImages } from '../src/photo/AddPanel.tsx';
import { ALL_STICKERS, FRAME_ENTRIES, SHAPE_ENTRIES } from '../src/photo/shapes-catalog.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function setup(frame = false) {
  const p = { onPickFiles: vi.fn(), onAddShape: vi.fn(), onAddText: vi.fn(), onAddSticker: vi.fn(), onPickFrame: frame ? vi.fn() : undefined };
  render(<AddPanel {...p} />);
  return p;
}
const file = (name: string, type: string) => new File(['x'], name, { type });

describe('AddPanel', () => {
  it('takes images only, from the file input', () => {
    const p = setup();
    const input = screen.getByLabelText('Add pictures') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
    const a = file('a.png', 'image/png');
    fireEvent.change(input, { target: { files: [a, file('b.txt', 'text/plain')] } });
    expect(p.onPickFiles).toHaveBeenCalledWith([a]);
  });
  it('does not call back when no picture was chosen', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Add pictures'), { target: { files: [file('b.txt', 'text/plain')] } });
    expect(p.onPickFiles).not.toHaveBeenCalled();
  });
  it('mentions drop and paste', () => {
    setup();
    expect(screen.getByText(/drop pictures/i)).toBeTruthy();
    expect(screen.getByText(/paste one/i)).toBeTruthy();
  });
  it('adds every shape', () => {
    const p = setup();
    for (const s of SHAPE_ENTRIES) fireEvent.click(screen.getByLabelText(`Add ${s.label.toLowerCase()}`));
    expect(p.onAddShape.mock.calls.map((c) => c[0])).toEqual(SHAPE_ENTRIES.map((s) => s.kind));
    expect(SHAPE_ENTRIES.map((s) => s.kind).sort()).toEqual(['arrow', 'ellipse', 'heart', 'line', 'rect', 'star', 'triangle']);
  });
  it('adds text', () => {
    const p = setup();
    fireEvent.click(screen.getByText('Add a text box'));
    expect(p.onAddText).toHaveBeenCalled();
  });
  it('adds a sticker', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Add sticker 🎉'));
    expect(p.onAddSticker).toHaveBeenCalledWith('🎉');
    expect(new Set(ALL_STICKERS).size).toBe(ALL_STICKERS.length);
  });
  it('shows frames only when it can apply them', () => {
    setup();
    expect(screen.queryByLabelText('Frames')).toBeNull();
    cleanup();
    const p = setup(true);
    fireEvent.click(screen.getByLabelText('Frame: heart'));
    expect(p.onPickFrame).toHaveBeenLastCalledWith('heart');
    fireEvent.click(screen.getByLabelText('Frame: none'));
    expect(p.onPickFrame).toHaveBeenLastCalledWith(undefined);
    expect(FRAME_ENTRIES.map((f) => f.frame).filter(Boolean).sort()).toEqual(['ellipse', 'heart', 'rounded', 'star', 'triangle']);
  });
  it('onlyImages filters', () => {
    expect(onlyImages([file('a', 'image/jpeg'), file('b', 'video/mp4')])).toHaveLength(1);
  });
});
