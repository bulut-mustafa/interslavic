// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { BottomSheet } from '../src/phone/BottomSheet.tsx';
import { screen } from './live-screen.ts';
import { pointer } from './phone-media.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(cleanup);

const sheet = () => document.querySelector('.ph-sheet') as HTMLElement | null;

describe('BottomSheet', () => {
  it('renders nothing while closed and a dialog while open', () => {
    const { rerender } = render(<BottomSheet open={false} onClose={() => {}} title="Adjust">body</BottomSheet>);
    expect(sheet()).toBeNull();
    rerender(<BottomSheet open onClose={() => {}} title="Adjust">body</BottomSheet>);
    expect(screen.getByRole('dialog', { name: 'Adjust' }).getAttribute('aria-modal')).toBe('false');
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('unmounts after closing', async () => {
    const { rerender } = render(<BottomSheet open onClose={() => {}} title="T">x</BottomSheet>);
    rerender(<BottomSheet open={false} onClose={() => {}} title="T">x</BottomSheet>);
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it('closes by the close button, Escape, and replaces the button with headerAction', () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="T">x</BottomSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    cleanup();
    const done = vi.fn();
    render(<BottomSheet open onClose={onClose} title="T" headerAction={<button onClick={done}>Done</button>}>x</BottomSheet>);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(done).toHaveBeenCalled();
  });

  it('a tap on the grabber cycles the detents', () => {
    render(<BottomSheet open onClose={() => {}} title="T" detents={['half', 'full']}>x</BottomSheet>);
    const grab = screen.getByRole('button', { name: 'Resize sheet' });
    expect(sheet()!.dataset.detent).toBe('0');
    fireEvent.click(grab);
    expect(sheet()!.dataset.detent).toBe('1');
    fireEvent.click(grab);
    expect(sheet()!.dataset.detent).toBe('0');
  });

  it('reports its height through --sheet-h and onHeight', () => {
    const onHeight = vi.fn();
    const target = document.createElement('div');
    render(<BottomSheet open onClose={() => {}} title="T" onHeight={onHeight} heightTarget={target}>x</BottomSheet>);
    const half = Math.round(0.45 * window.innerHeight);
    expect(target.style.getPropertyValue('--sheet-h')).toBe(`${half}px`);
    expect(onHeight).toHaveBeenLastCalledWith(half);
    fireEvent.click(screen.getByRole('button', { name: 'Resize sheet' }));
    expect(target.style.getPropertyValue('--sheet-h')).toBe(`${Math.round(0.85 * window.innerHeight)}px`);
  });

  const drag = (to: number, from = 400) => {
    const head = document.querySelector('.ph-sheet-head')!;
    pointer(head, 'pointerdown', 1, 50, from);
    pointer(head, 'pointermove', 1, 50, (from + to) / 2);
    pointer(head, 'pointermove', 1, 50, to);
    pointer(head, 'pointerup', 1, 50, to);
  };

  it('dragging the header far down dismisses; a short drag snaps to a detent', () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="T" detents={['half', 'full']}>x</BottomSheet>);
    drag(120, 100); // a slow 20px nudge
    expect(onClose).not.toHaveBeenCalled();
    drag(700, 100); // far down
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a drag up lands on the taller detent', () => {
    render(<BottomSheet open onClose={() => {}} title="T" detents={['half', 'full']}>x</BottomSheet>);
    drag(100, 500);
    expect(sheet()!.dataset.detent).toBe('1');
  });

  it('is not dismissible by drag when dismissible is false', () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="T" dismissible={false}>x</BottomSheet>);
    drag(900, 100);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps touch-action off the body (only the head owns drags)', () => {
    const css = readFileSync(resolve(__dirname, '../src/phone/bottom-sheet.css'), 'utf8');
    const body = /\.ph-sheet-body\s*{[^}]*}/.exec(css)![0];
    expect(body).not.toMatch(/touch-action/);
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('works controlled by a parent', async () => {
    function Host() {
      const [o, setO] = useState(false);
      return (
        <>
          <button onClick={() => setO(true)}>open</button>
          <BottomSheet open={o} onClose={() => setO(false)} title="Panel">x</BottomSheet>
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByText('open'));
    expect(sheet()).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await waitFor(() => expect(sheet()).toBeNull());
  });
});
