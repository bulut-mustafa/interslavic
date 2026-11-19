import type { SourceFiles } from './contracts.ts';

/**
 * The media elements behind the preview and the export: one <video>, <audio>
 * or <img> per ITEM (a main clip or a layer), never per file, because the same
 * file can be playing at two different moments at once.
 *
 * Elements are made once per item, kept while the item is playing or about to,
 * and released (paused, source cleared, `load()` called) when it is neither.
 * Browsers decode only so many videos at once and publish no figure
 * (docs/ideas/video-research-transport.md), so the number of live <video>
 * elements is capped; when the cap is hit the least recently used one that is
 * not protected is released.
 */

/** Live video elements allowed at once. Unmeasured, conservative; see the research note. */
export const MAX_LIVE_VIDEOS = 4;

export interface PoolItem {
  itemId: string;
  srcId: string;
  kind: 'video' | 'image' | 'audio';
}

export interface PoolEntry {
  itemId: string;
  srcId: string;
  kind: PoolItem['kind'];
  el: HTMLMediaElement | HTMLImageElement;
  /** True from the moment the transport sets `currentTime` until `seeked` (or an error / timeout). */
  seeking: boolean;
  /** A seek asked for before metadata was loaded; applied on `loadedmetadata`. */
  wantTime: number | null;
  /** The element has been put at its first moment already (preload). */
  primed: boolean;
  /** Last rate/volume written, to avoid touching the element every frame. */
  rate: number;
  /** Sink mode only: made lazily, once per element. */
  gain: GainNode | null;
  source: MediaElementAudioSourceNode | null;
  lastUsed: number;
  /** play() was refused by the browser; not retried every frame. */
  blocked: boolean;
}

export interface PoolOptions {
  files: SourceFiles;
  sink?: { context: AudioContext; destination: AudioNode };
  maxVideos?: number;
  /** Called when an element finished a seek or failed to; the transport uses it to know a frame is ready. */
  onSettled?(entry: PoolEntry): void;
  /** Called when something that changes the picture finished: an image's load/error, a media element's loadeddata/canplay/seeked. */
  onPicture?(): void;
  /** For tests: makes the element. Defaults to document.createElement / new Image. */
  create?(kind: PoolItem['kind']): HTMLMediaElement | HTMLImageElement;
}

export interface MediaPool {
  /** The entry for an item, made on first use. `protect` lists item ids that must not be evicted to make room. Null when no file, or no room. */
  acquire(item: PoolItem, protect?: ReadonlySet<string>): PoolEntry | null;
  get(itemId: string): PoolEntry | undefined;
  /** Releases every entry whose item id is not in `keep`. */
  retain(keep: ReadonlySet<string>): void;
  release(itemId: string): void;
  pauseAll(): void;
  /** The gain node for an item in sink mode (made on first call); null in preview mode. */
  gainOf(entry: PoolEntry): GainNode | null;
  /** What the compositor draws, or null while not ready. */
  picture(itemId: string): CanvasImageSource | null;
  entries(): PoolEntry[];
  liveVideos(): number;
  dispose(): void;
}

const defaultCreate = (kind: PoolItem['kind']): HTMLMediaElement | HTMLImageElement =>
  kind === 'image' ? new Image() : document.createElement(kind === 'video' ? 'video' : 'audio');

const isMediaEl = (el: PoolEntry['el']): el is HTMLMediaElement => 'play' in el;

export function createPool(o: PoolOptions): MediaPool {
  const map = new Map<string, PoolEntry>();
  const max = o.maxVideos ?? MAX_LIVE_VIDEOS;
  const create = o.create ?? defaultCreate;
  let tick = 0;

  const liveVideos = (): number => [...map.values()].filter((e) => e.kind === 'video').length;

  function release(itemId: string): void {
    const e = map.get(itemId);
    if (!e) return;
    map.delete(itemId);
    if (isMediaEl(e.el)) {
      try {
        e.el.pause();
      } catch {
        /* an element that cannot pause is being thrown away anyway */
      }
    }
    e.source?.disconnect();
    e.gain?.disconnect();
    e.el.removeAttribute('src');
    if (isMediaEl(e.el)) e.el.load();
  }

  function wire(e: PoolEntry): void {
    const el = e.el;
    if (!isMediaEl(el)) {
      el.addEventListener('load', () => o.onPicture?.());
      el.addEventListener('error', () => o.onPicture?.());
      return;
    }
    for (const n of ['loadeddata', 'canplay', 'seeked']) el.addEventListener(n, () => o.onPicture?.());
    const settle = (): void => {
      e.seeking = false;
      o.onSettled?.(e);
    };
    el.addEventListener('seeked', settle);
    el.addEventListener('error', settle);
    el.addEventListener('loadedmetadata', () => {
      if (e.wantTime !== null) {
        const t = e.wantTime;
        e.wantTime = null;
        e.seeking = true;
        el.currentTime = t;
      }
    });
  }

  return {
    acquire(item, protect = new Set()) {
      const have = map.get(item.itemId);
      if (have && have.srcId === item.srcId && have.kind === item.kind) {
        have.lastUsed = ++tick;
        return have;
      }
      if (have) release(item.itemId); // the item now plays another file
      const url = o.files.urlOf(item.srcId);
      if (!url) return null;
      if (item.kind === 'video' && liveVideos() >= max) {
        const victim = [...map.values()]
          .filter((e) => e.kind === 'video' && !protect.has(e.itemId))
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];
        if (!victim) return null;
        release(victim.itemId);
      }
      const el = create(item.kind);
      const e: PoolEntry = {
        itemId: item.itemId, srcId: item.srcId, kind: item.kind, el,
        seeking: false, wantTime: null, primed: false, rate: 1, gain: null, source: null, lastUsed: ++tick, blocked: false,
      };
      if (isMediaEl(el)) {
        el.preload = 'auto';
        if ('playsInline' in el) (el as HTMLVideoElement).playsInline = true;
      }
      wire(e);
      el.src = url;
      map.set(item.itemId, e);
      return e;
    },
    get: (id) => map.get(id),
    retain(keep) {
      for (const id of [...map.keys()]) if (!keep.has(id)) release(id);
    },
    release,
    pauseAll() {
      for (const e of map.values()) if (isMediaEl(e.el)) e.el.pause();
    },
    gainOf(e) {
      if (!o.sink || !isMediaEl(e.el)) return null;
      if (!e.gain) {
        // createMediaElementSource may be called once per element: it is called here, once, and the node kept.
        e.source = o.sink.context.createMediaElementSource(e.el);
        e.gain = o.sink.context.createGain();
        e.source.connect(e.gain);
        e.gain.connect(o.sink.destination);
      }
      return e.gain;
    },
    picture(itemId) {
      const e = map.get(itemId);
      if (!e) return null;
      if (e.kind === 'image') {
        const img = e.el as HTMLImageElement;
        return img.complete && img.naturalWidth > 0 ? img : null;
      }
      if (e.kind === 'video') return (e.el as HTMLVideoElement).readyState >= 2 ? (e.el as HTMLVideoElement) : null;
      return null;
    },
    entries: () => [...map.values()],
    liveVideos,
    dispose() {
      for (const id of [...map.keys()]) release(id);
    },
  };
}
