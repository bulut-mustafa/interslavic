// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LibraryProvider, targetOf, useLibrary, usePhotoLibraryOpen, useReportPhotoTarget, useVideoLibraryOpen, type LibraryItem, type OpenMode } from '../src/studio/library.tsx';
import { UploadsSheet } from '../src/studio/UploadsSheet.tsx';
import { screen } from './live-screen.ts';

beforeEach(() => {
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
  window.history.replaceState({}, '', '/studio/photo');
});
afterEach(cleanup);

const png = new File(['x'], 'pic.png', { type: 'image/png' });
let lib: ReturnType<typeof useLibrary>;
const Grab = () => ((lib = useLibrary()), null);
type Seen = { name: string; mode?: OpenMode };
function Photo({ log, open = true }: { log: Seen[]; open?: boolean }) {
  usePhotoLibraryOpen((item: LibraryItem, mode) => log.push({ name: `photo:${item.file.name}`, mode }));
  useReportPhotoTarget(open);
  return null;
}
function Video({ log }: { log: Seen[] }) {
  useVideoLibraryOpen((item, mode) => log.push({ name: `video:${item.file.name}`, mode }));
  return null;
}
const setup = (log: Seen[], open = true, path = '/studio/photo') =>
  render(
    <LibraryProvider path={path}>
      <Grab />
      <Photo log={log} open={open} />
      <Video log={log} />
      <UploadsSheet onClose={() => {}} />
    </LibraryProvider>,
  );
const add = () => {
  let made: LibraryItem[] = [];
  act(() => {
    made = lib.add([png]);
  });
  return made[0]!;
};

describe('the Photo editor as a target for objects', () => {
  it('routes an overlay picture to Photo only while Photo has a page open', () => {
    expect(targetOf('image', 'overlay')).toBe('video');
    expect(targetOf('image', 'overlay', true)).toBe('photo');
    expect(targetOf('image', 'replace', true)).toBe('photo');
    expect(targetOf('image', 'append', true)).toBe('video');
    expect(targetOf('video', 'overlay', true)).toBe('video');
  });

  it('offers "Add to this picture" beside an open page, and the thumbnail still opens a new page', () => {
    const log: Seen[] = [];
    setup(log);
    add();
    const thumb = screen.getByRole('button', { name: 'Open pic.png' });
    const addBtn = screen.getByRole('button', { name: 'Add to this picture: pic.png' });
    expect(addBtn.getAttribute('data-tip')).toBe('Add to this picture');
    fireEvent.click(addBtn);
    fireEvent.click(thumb);
    expect(log).toEqual([{ name: 'photo:pic.png', mode: 'overlay' }, { name: 'photo:pic.png', mode: undefined }]);
    expect(window.location.pathname).toBe('/studio/photo');
  });

  it('offers nothing extra with no page open, beside another tool, or for other kinds', () => {
    setup([], false);
    add();
    expect(screen.queryByRole('button', { name: /Add to this picture/ })).toBeNull();
    cleanup();
    setup([], true, '/studio/video');
    add();
    expect(screen.queryByRole('button', { name: /Add to this picture/ })).toBeNull();
  });

  it('stops offering when the Photo editor goes away', () => {
    const r = render(
      <LibraryProvider path="/studio/photo">
        <Grab />
        <Photo log={[]} />
        <UploadsSheet onClose={() => {}} />
      </LibraryProvider>,
    );
    add();
    expect(screen.getByRole('button', { name: /Add to this picture/ })).toBeTruthy();
    r.rerender(
      <LibraryProvider path="/studio/photo">
        <Grab />
        <UploadsSheet onClose={() => {}} />
      </LibraryProvider>,
    );
    expect(screen.queryByRole('button', { name: /Add to this picture/ })).toBeNull();
  });
});
