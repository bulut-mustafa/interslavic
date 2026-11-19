// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DropZone, matchesAccept, size } from '../src/components/DropZone.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

describe('matchesAccept', () => {
  const f = (name: string, type = '') => ({ name, type });
  it('matches a MIME wildcard, an exact type and an extension', () => {
    expect(matchesAccept(f('a.mp4', 'video/mp4'), 'video/*')).toBe(true);
    expect(matchesAccept(f('a.srt', 'text/plain'), '.srt,text/plain')).toBe(true);
    expect(matchesAccept(f('A.SRT'), '.srt')).toBe(true);
  });
  it('refuses a file of another kind', () => {
    expect(matchesAccept(f('a.png', 'image/png'), 'video/*,audio/*')).toBe(false);
    expect(matchesAccept(f('a.txt', 'text/plain'), '.srt')).toBe(false);
  });
  it('lets a file with no type through a MIME wildcard, for the decoder to judge', () => {
    expect(matchesAccept(f('clip.mkv'), 'video/*')).toBe(true);
  });
  it('accepts anything when nothing is listed', () => {
    expect(matchesAccept(f('x'), '')).toBe(true);
  });
});

describe('size', () => {
  it('writes bytes, kilobytes and megabytes', () => {
    expect(size(512)).toBe('512 B');
    expect(size(2048)).toBe('2 KB');
    expect(size(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(size(150 * 1024 * 1024)).toBe('150 MB');
  });
});

describe('DropZone', () => {
  const setup = (extra = {}) => {
    const onFile = vi.fn();
    render(<DropZone name="Video" title="Drop a video" hint="MP4" accept="video/*" kind="video" noun="a video" file={null} onFile={onFile} {...extra} />);
    return onFile;
  };

  it('shows its title and hint, and takes a chosen file', () => {
    const onFile = setup();
    expect(screen.getByText('Drop a video')).toBeTruthy();
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('Video'), { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('takes a dropped file', () => {
    const onFile = setup();
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' });
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('refuses a file of the wrong kind, saying so', () => {
    const onFile = setup();
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('That file is not a video.');
  });

  it('shows the chosen file\'s name and size instead of the prompt', () => {
    setup({ file: new File(['x'.repeat(2048)], 'clip.mp4', { type: 'video/mp4' }) });
    expect(screen.getByText('clip.mp4')).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
    expect(screen.queryByText('Drop a video')).toBeNull();
  });

  it('does nothing while disabled', () => {
    const onFile = setup({ disabled: true });
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [new File(['x'], 'a.mp4', { type: 'video/mp4' })] } });
    expect(onFile).not.toHaveBeenCalled();
  });
});
