import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../router.tsx';
import { kindOfFile } from '../video/sources.ts';

/**
 * The pictures, clips and sounds the user has opened in the Studio, kept for
 * the visit so any of them can be used again at once, from the Uploads strip
 * beside the editors. They live in memory only: nothing is stored or sent, and
 * a reload starts empty.
 *
 * THE MODE CONTRACT. `open(item, { mode })` says what the click means:
 *  - no mode (or 'replace'): the old behaviour. A picture goes to the Photo
 *    editor, a video to the Video editor, which starts a new project with it.
 *  - 'append': a video is added to the end of the Video editor's main track.
 *  - 'overlay': a video or picture is placed over the main track at the
 *    playhead; a sound (audio item) is placed on a sound lane at the playhead.
 *    Sounds are always placed this way, whatever the mode.
 * Any item opened WITH a mode goes to the Video editor, pictures included.
 * Each editor registers one handler per (editor, kind): Photo registers its
 * 'image' handler with `useLibraryOpen('image', ...)`, the Video editor
 * registers for 'video', 'image' and 'audio' with `useVideoLibraryOpen`. An
 * item opened before its editor has registered waits, and is handed over (with
 * its mode) the moment the handler arrives; the newest waiting item wins.
 *
 * The Video editor also says whether it has a project open (`useReportVideoTarget`),
 * which is what makes the Uploads sheet offer the add-to-timeline buttons. The
 * Photo editor does the same with `useReportPhotoTarget`: while it has a page
 * open, a picture opened with mode 'overlay' (the sheet's "Add to this picture")
 * stays in Photo, which registers with `usePhotoLibraryOpen`.
 */

export type MediaKind = 'image' | 'video' | 'audio';

export type OpenMode = 'replace' | 'append' | 'overlay';

/** The editors that take items from the library. */
type Target = 'photo' | 'video';

/** What the Video editor tells the Uploads sheet about itself. */
export interface VideoTarget {
  /** A project is open, so items can be added to it. */
  open: boolean;
}

/** What the Photo editor tells the Uploads sheet about itself. */
export interface PhotoTarget {
  /** A page is open, so pictures can be added to it as objects. */
  open: boolean;
}

export interface LibraryItem {
  id: string;
  file: File;
  kind: MediaKind;
  /** An address the page can show the file from. */
  url: string;
  /** A small still from a video; images are shown from `url` itself. */
  thumb: string | null;
}

/** Picture, video or sound; one definition with the editor (an SVG is a picture). */
export function kindOf(file: Pick<File, 'name' | 'type'>): MediaKind | null {
  return kindOfFile(file);
}

const keyOf = (f: File): string => `${f.name}|${f.size}|${f.lastModified}`;

/** A still from near the start of a video, or null where the browser cannot make one. */
export function videoThumb(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const done = (r: string | null) => {
      clearTimeout(timer);
      v.removeAttribute('src');
      resolve(r);
    };
    const timer = setTimeout(() => done(null), 5000);
    v.muted = true;
    v.preload = 'auto';
    v.onerror = () => done(null);
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.2, (Number.isFinite(v.duration) ? v.duration : 0.2) / 2);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = Math.max(1, Math.round((160 * (v.videoHeight || 9)) / (v.videoWidth || 16)));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL('image/jpeg', 0.6));
      } catch {
        done(null);
      }
    };
    v.src = url;
  });
}

type Handler = (file: File, item: LibraryItem, mode?: OpenMode) => void;

/** Which editor an item goes to: anything opened with a mode other than 'replace', and every sound and video, goes to the Video editor, except a picture opened as 'overlay' while Photo reports an open page (`photoOpen`). */
export function targetOf(kind: MediaKind, mode?: OpenMode, photoOpen = false): Target {
  // A picture opened as an object while the Photo editor is showing and has a page open stays in Photo.
  if (photoOpen && kind === 'image' && mode === 'overlay') return 'photo';
  return (mode && mode !== 'replace') || kind !== 'image' ? 'video' : 'photo';
}

/** The editor an item opened with `useLibraryOpen(kind, ...)` belongs to. */
const defaultTarget = (kind: MediaKind): Target => targetOf(kind);

interface Library {
  items: LibraryItem[];
  /** Adds files (ones that are not pictures or videos are left out); a file already there is not added twice. Returns the items for the files given. */
  add(files: File[]): LibraryItem[];
  remove(id: string): void;
  /** The item last opened in an editor. */
  openedId: string | null;
  markOpened(id: string | null): void;
  /** Opens an item in the editor for its kind (or, with a mode, in the Video editor), going there first if need be. */
  open(item: LibraryItem, opts?: { mode?: OpenMode }): void;
  /** An editor says it can open items of a kind; returns the way to stop. `target` defaults to the editor that owns the kind. */
  register(kind: MediaKind, handler: Handler, target?: Target): () => void;
  /** The path of the tool showing, so the Uploads sheet knows which editor it sits beside. */
  path: string;
  videoTarget: VideoTarget;
  setVideoTarget(t: VideoTarget): void;
  photoTarget: PhotoTarget;
  setPhotoTarget(t: PhotoTarget): void;
}

const inert: Library = {
  items: [],
  add: () => [],
  remove: () => {},
  openedId: null,
  markOpened: () => {},
  open: () => {},
  register: () => () => {},
  path: '',
  videoTarget: { open: false },
  setVideoTarget: () => {},
  photoTarget: { open: false },
  setPhotoTarget: () => {},
};

const LibraryContext = createContext<Library>(inert);
export const useLibrary = (): Library => useContext(LibraryContext);

/** An editor's way into the library: items clicked in the Uploads strip arrive at `onOpen`. */
export function useLibraryOpen(kind: MediaKind, onOpen: Handler): void {
  const lib = useLibrary();
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => lib.register(kind, (f, item, mode) => latest.current(f, item, mode)), [lib.register, kind]);
}

/**
 * The Video editor's way into the library: videos, pictures and sounds clicked
 * in the Uploads strip arrive at `onOpen` with the mode they were opened with
 * (undefined = replace). One handler for all three kinds.
 */
export function useVideoLibraryOpen(onOpen: (item: LibraryItem, mode?: OpenMode) => void): void {
  const lib = useLibrary();
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => {
    const stops = (['video', 'image', 'audio'] as const).map((kind) => lib.register(kind, (_f, item, mode) => latest.current(item, mode), 'video'));
    return () => stops.forEach((stop) => stop());
  }, [lib.register]);
}

/** The Video editor reports whether a project is open; it is reported closed again when the editor goes. */
export function useReportVideoTarget(open: boolean): void {
  const { setVideoTarget } = useLibrary();
  useEffect(() => {
    setVideoTarget({ open });
    return () => setVideoTarget({ open: false });
  }, [open, setVideoTarget]);
}

/**
 * The Photo editor's way into the library for objects: a picture clicked as
 * "Add to this picture" arrives at `onOpen` with mode 'overlay'. A plain click
 * (open as a new page) arrives with no mode. Same handler slot as
 * `useLibraryOpen('image', ...)`, which Photo may keep using instead.
 */
export function usePhotoLibraryOpen(onOpen: (item: LibraryItem, mode?: OpenMode) => void): void {
  const lib = useLibrary();
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => lib.register('image', (_f, item, mode) => latest.current(item, mode), 'photo'), [lib.register]);
}

/** The Photo editor reports whether a page is open; it is reported closed again when the editor goes. */
export function useReportPhotoTarget(open: boolean): void {
  const { setPhotoTarget } = useLibrary();
  useEffect(() => {
    setPhotoTarget({ open });
    return () => setPhotoTarget({ open: false });
  }, [open, setPhotoTarget]);
}

const PATH: Record<Target, string> = { photo: '/studio/photo', video: '/studio/video' };

export function LibraryProvider({ children, path }: { children: ReactNode; path: string }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [videoTarget, setVideoTarget] = useState<VideoTarget>({ open: false });
  const [photoTarget, setPhotoTarget] = useState<PhotoTarget>({ open: false });
  const handlers = useRef(new Map<string, Handler>());
  const pending = useRef(new Map<string, { item: LibraryItem; mode?: OpenMode }>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const add = useCallback((files: File[]): LibraryItem[] => {
    const made: LibraryItem[] = [];
    const fresh: LibraryItem[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) continue;
      const have = [...itemsRef.current, ...fresh].find((i) => keyOf(i.file) === keyOf(file));
      if (have) {
        made.push(have);
        continue;
      }
      const item: LibraryItem = { id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, file, kind, url: URL.createObjectURL(file), thumb: null };
      fresh.push(item);
      made.push(item);
    }
    if (fresh.length > 0) {
      itemsRef.current = [...itemsRef.current, ...fresh];
      setItems(itemsRef.current);
      for (const item of fresh) {
        if (item.kind === 'video') {
          void videoThumb(item.url).then((thumb) => thumb && setItems((all) => all.map((i) => (i.id === item.id ? { ...i, thumb } : i))));
        }
      }
    }
    return made;
  }, []);

  const remove = useCallback((id: string) => {
    const gone = itemsRef.current.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
    setItems(itemsRef.current);
    setOpenedId((o) => (o === id ? null : o));
  }, []);

  const register = useCallback((kind: MediaKind, handler: Handler, target: Target = defaultTarget(kind)) => {
    const key = `${target}:${kind}`;
    handlers.current.set(key, handler);
    const waiting = pending.current.get(key);
    if (waiting) {
      pending.current.delete(key);
      handler(waiting.item.file, waiting.item, waiting.mode);
    }
    return () => {
      if (handlers.current.get(key) === handler) handlers.current.delete(key);
    };
  }, []);

  const open = useCallback(
    (item: LibraryItem, opts?: { mode?: OpenMode }) => {
      const mode = opts?.mode;
      const target = targetOf(item.kind, mode, photoTarget.open && path.replace(/\/$/, '') === PATH.photo);
      if (path.replace(/\/$/, '') !== PATH[target]) navigate(PATH[target]);
      const key = `${target}:${item.kind}`;
      const h = handlers.current.get(key);
      if (h) h(item.file, item, mode);
      else pending.current.set(key, { item, mode }); // the editor has not been opened yet; it takes this when it starts
    },
    [path, photoTarget.open],
  );

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const value = useMemo<Library>(
    () => ({ items, add, remove, openedId, markOpened: setOpenedId, open, register, path, videoTarget, setVideoTarget, photoTarget, setPhotoTarget }),
    [items, add, remove, openedId, open, register, path, videoTarget, photoTarget],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
