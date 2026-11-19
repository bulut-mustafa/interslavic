// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LibraryProvider, kindOf, targetOf, useLibrary, useLibraryOpen, useReportVideoTarget, useVideoLibraryOpen, type LibraryItem, type OpenMode } from '../src/studio/library.tsx';
import { UploadsSheet } from '../src/studio/UploadsSheet.tsx';
import { screen } from './live-screen.ts';

beforeEach(() => {
  let n = 0;
  URL.createObjectURL = () => `blob:${n++}`;
  URL.revokeObjectURL = () => {};
  window.history.replaceState({}, '', '/studio/video');
});
afterEach(cleanup);

const png = new File(['x'], 'pic.png', { type: 'image/png' });
const mp4 = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
const mp3 = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });

let lib: ReturnType<typeof useLibrary>;
function Grab() {
  lib = useLibrary();
  return null;
}
type Seen = { name: string; mode?: OpenMode };
function Photo({ log }: { log: Seen[] }) {
  useLibraryOpen('image', (f, _i, mode) => log.push({ name: `photo:${f.name}`, mode }));
  return null;
}
function Video({ log, open = true }: { log: Seen[]; open?: boolean }) {
  useVideoLibraryOpen((item: LibraryItem, mode) => log.push({ name: `video:${item.file.name}`, mode }));
  useReportVideoTarget(open);
  return null;
}
const items = (...files: File[]) => {
  let made: LibraryItem[] = [];
  act(() => {
    made = lib.add(files);
  });
  return made;
};
const open = (item: LibraryItem, mode?: OpenMode) =>
  act(() => {
    lib.open(item, mode ? { mode } : undefined);
  });

describe('kinds', () => {
  it('knows sounds', () => {
    expect(kindOf({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio');
    expect(kindOf({ name: 'a.flac', type: '' })).toBe('audio');
    expect(kindOf({ name: 'a.ogv', type: '' })).toBe('video');
  });
  it('routes by kind and mode', () => {
    expect(targetOf('image')).toBe('photo');
    expect(targetOf('image', 'replace')).toBe('photo');
    expect(targetOf('image', 'overlay')).toBe('video');
    expect(targetOf('video')).toBe('video');
    expect(targetOf('audio')).toBe('video');
  });
});

describe('opening with a mode', () => {
  const setup = (log: Seen[], photo = true) =>
    render(
      <LibraryProvider path="/studio/video">
        <Grab />
        {photo && <Photo log={log} />}
        <Video log={log} />
      </LibraryProvider>,
    );

  it('keeps today\'s routing without a mode: pictures to Photo, videos to the Video editor', () => {
    const log: Seen[] = [];
    setup(log);
    const [a, b] = items(png, mp4);
    open(a!);
    open(b!);
    expect(log).toEqual([{ name: 'photo:pic.png', mode: undefined }, { name: 'video:clip.mp4', mode: undefined }]);
  });

  it('sends a picture to the Video editor, with the mode, when a mode is given', () => {
    const log: Seen[] = [];
    setup(log);
    const [a, b, c] = items(png, mp4, mp3);
    open(a!, 'overlay');
    open(b!, 'append');
    open(c!, 'overlay');
    expect(log).toEqual([
      { name: 'video:pic.png', mode: 'overlay' },
      { name: 'video:clip.mp4', mode: 'append' },
      { name: 'video:song.mp3', mode: 'overlay' },
    ]);
  });

  it('keeps one handler per editor and kind: the newest wins, and a stopped one is gone', () => {
    const first: Seen[] = [];
    const second: Seen[] = [];
    const r = render(
      <LibraryProvider path="/studio/video">
        <Grab />
        <Video log={first} />
      </LibraryProvider>,
    );
    const [m] = items(mp4);
    r.rerender(
      <LibraryProvider path="/studio/video">
        <Grab />
        <Video log={first} />
        <Video log={second} />
      </LibraryProvider>,
    );
    open(m!);
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('queues an item until its editor registers, and hands over the mode', () => {
    const log: Seen[] = [];
    const r = render(
      <LibraryProvider path="/studio/video">
        <Grab />
      </LibraryProvider>,
    );
    const [a] = items(png);
    open(a!, 'overlay');
    expect(log).toHaveLength(0);
    r.rerender(
      <LibraryProvider path="/studio/video">
        <Grab />
        <Video log={log} />
      </LibraryProvider>,
    );
    expect(log).toEqual([{ name: 'video:pic.png', mode: 'overlay' }]);
  });

  it('does not hand a Photo-bound picture to the Video editor that is waiting', () => {
    const log: Seen[] = [];
    render(
      <LibraryProvider path="/studio/video">
        <Grab />
        <Video log={log} />
      </LibraryProvider>,
    );
    const [a] = items(png);
    open(a!);
    expect(log).toHaveLength(0); // waits for Photo
  });

  it('goes to the Video editor\'s page when opened with a mode from Photo', () => {
    render(
      <LibraryProvider path="/studio/photo">
        <Grab />
      </LibraryProvider>,
    );
    window.history.replaceState({}, '', '/studio/photo');
    const [a] = items(png);
    open(a!, 'overlay');
    expect(window.location.pathname).toBe('/studio/video');
  });
});

describe('the Uploads sheet beside an open video project', () => {
  const sheet = (open: boolean, path = '/studio/video', log: Seen[] = []) =>
    render(
      <LibraryProvider path={path}>
        <Grab />
        <Video log={log} open={open} />
        <UploadsSheet onClose={() => {}} />
      </LibraryProvider>,
    );

  it('looks as it does today when no project is open', () => {
    sheet(false);
    items(png, mp4, mp3);
    expect(screen.getByRole('button', { name: 'Open pic.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open clip.mp4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open song.mp3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add to timeline|Add as/ })).toBeNull();
  });

  it('does not offer them beside another tool even if a project is open', () => {
    sheet(true, '/studio/photo');
    items(mp4);
    expect(screen.queryByRole('button', { name: /Add to timeline/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open clip.mp4' })).toBeTruthy();
  });

  it('accepts sounds, and offers add-to-timeline, overlay and sound buttons with tooltips', () => {
    const log: Seen[] = [];
    sheet(true, '/studio/video', log);
    expect((screen.getByLabelText('Add to uploads') as HTMLInputElement).accept).toBe('image/*,video/*,audio/*');
    items(png, mp4, mp3);
    const timeline = screen.getByRole('button', { name: 'Add to timeline: clip.mp4' });
    expect(timeline.getAttribute('data-tip')).toBe('Add to timeline');
    expect(screen.getByRole('button', { name: 'Add as overlay: clip.mp4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add as overlay: pic.png' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to timeline: pic.png' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add as sound: song.mp3' })).toBeTruthy();

    fireEvent.click(timeline);
    fireEvent.click(screen.getByRole('button', { name: 'Add as overlay: clip.mp4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add pic.png as an overlay' })); // the thumbnail does the same
    fireEvent.click(screen.getByRole('button', { name: 'Add as sound: song.mp3' }));
    expect(log).toEqual([
      { name: 'video:clip.mp4', mode: 'append' },
      { name: 'video:clip.mp4', mode: 'overlay' },
      { name: 'video:pic.png', mode: 'overlay' },
      { name: 'video:song.mp3', mode: 'overlay' },
    ]);
  });

  it('clicking a video thumbnail adds it to the timeline', () => {
    const log: Seen[] = [];
    sheet(true, '/studio/video', log);
    items(mp4);
    fireEvent.click(screen.getByRole('button', { name: 'Add clip.mp4 to the timeline' }));
    expect(log).toEqual([{ name: 'video:clip.mp4', mode: 'append' }]);
  });

  it('stops offering them when the editor reports its project closed', () => {
    const log: Seen[] = [];
    const r = sheet(true, '/studio/video', log);
    items(mp4);
    expect(screen.getByRole('button', { name: 'Add to timeline: clip.mp4' })).toBeTruthy();
    r.rerender(
      <LibraryProvider path="/studio/video">
        <Grab />
        <Video log={log} open={false} />
        <UploadsSheet onClose={() => {}} />
      </LibraryProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Add to timeline: clip.mp4' })).toBeNull();
  });
});

void vi;
