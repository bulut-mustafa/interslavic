// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ExportDialog, type ExportDialogProps } from '../src/photo/ExportDialog.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);
const pages = [
  { id: 'a', name: 'one.png', width: 1000, height: 500 },
  { id: 'b', name: 'two.png', width: 800, height: 800 },
];
const setup = (over: Partial<ExportDialogProps> = {}) => {
  const onExport = vi.fn();
  const onClose = vi.fn();
  render(<ExportDialog pages={pages} currentId="a" onExport={onExport} onClose={onClose} maxPixels={1e9} {...over} />);
  return { onExport, onClose };
};
const radio = (name: string) => screen.getByRole('radio', { name });

describe('ExportDialog', () => {
  it('is an accessible dialog: labelled, focus goes in, Escape closes', () => {
    const { onClose } = setup();
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement).toBe(radio('PNG'));
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Tab inside', () => {
    setup();
    const download = screen.getByRole('button', { name: 'Download' });
    download.focus();
    fireEvent.keyDown(download, { key: 'Tab' });
    expect(document.activeElement).toBe(radio('PNG'));
    fireEvent.keyDown(radio('PNG'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(download);
  });

  it('downloads PNG at 1x of the current page by default', () => {
    const { onExport } = setup();
    expect(screen.getByRole('dialog').textContent).toContain('1000 × 500 px');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onExport).toHaveBeenCalledWith({ format: 'png', quality: 0.92, scale: 1, transparent: false, scope: 'current' });
  });

  it('shows quality only for lossy formats, transparency only for PNG and WebP, and says JPG is filled white', () => {
    setup();
    expect(screen.queryByLabelText('Quality')).toBeNull();
    expect(screen.getByLabelText('Transparent background')).toBeTruthy();
    fireEvent.click(radio('JPG'));
    expect(screen.getByLabelText('Quality')).toBeTruthy();
    expect(screen.queryByLabelText('Transparent background')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toContain('filled white');
    fireEvent.click(radio('WebP'));
    expect(screen.getByLabelText('Transparent background')).toBeTruthy();
  });

  it('never asks for transparency from JPG even if it was ticked on PNG first', () => {
    const { onExport } = setup();
    fireEvent.click(screen.getByLabelText('Transparent background'));
    fireEvent.click(radio('JPG'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({ format: 'jpeg', transparent: false });
  });

  it('takes scale presets and a width in pixels (the height follows)', () => {
    const { onExport } = setup();
    fireEvent.click(radio('2x'));
    expect(screen.getByRole('dialog').textContent).toContain('2000 × 1000 px');
    fireEvent.click(radio('Pixels'));
    fireEvent.change(screen.getByLabelText('Width in pixels'), { target: { value: '500' } });
    expect((screen.getByLabelText('Height in pixels') as HTMLInputElement).value).toBe('250');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({ scale: 0.5 });
  });

  it('warns when the size is over the browser limit, and shows the size it will really be', () => {
    setup({ maxPixels: 600_000 });
    fireEvent.click(radio('2x'));
    expect(screen.getByRole('alert').textContent).toContain('cannot make a picture that large');
    expect(screen.getByRole('dialog').textContent).toMatch(/1[01]\d\d × 5\d\d px|1\d\d\d × \d+ px/);
  });

  it('offers page choices only when there are several, and words them for the format', () => {
    const { onExport } = setup();
    fireEvent.click(radio('All 2 pages as a zip'));
    fireEvent.click(radio('PDF'));
    expect(radio('All 2 pages in one PDF')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({ format: 'pdf', scope: 'all' });
    cleanup();
    setup({ pages: [pages[0]!] });
    expect(screen.queryByRole('radiogroup', { name: 'Pages' })).toBeNull();
  });

  it('Cancel closes without exporting', () => {
    const { onExport, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });
});
