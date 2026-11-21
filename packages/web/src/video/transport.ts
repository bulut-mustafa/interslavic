import type { CreateTransport, Transport, TransportOptions } from './contracts.ts';
import { createPool, type MediaPool, type PoolEntry, type PoolOptions } from './media-pool.ts';
import { editLength } from './project.ts';
import { perfBump } from './perf.ts';
import { activeItems, DRIFT_LIMIT, upcomingItems, type ScheduledItem } from './schedule.ts';
import { total } from './timeline.ts';

/**
 * Plays a project. The playhead is an edit-time clock driven by
 * `performance.now` while playing, NOT by any element: every animation frame
 * the transport asks the schedule what should be playing, starts, pauses and
 * (when an element has strayed past DRIFT_LIMIT) re-seeks the matching
 * elements, and sets their volume and rate. One stalled element therefore
 * never stalls the edit. Browser facts relied on: docs/ideas/video-research-transport.md.
 */

/** `playbackRate` is kept within the one range MDN documents as audible (Gecko mutes outside 0.25 to 4). */
export const RATE_MIN = 0.25;
export const RATE_MAX = 4;
/** Seconds ahead of the playhead whose items get an element made and put at their first frame. */
export const LOOKAHEAD = 1;
/** After a paused seek, `onFrame` is called at the latest this long after, even if a `seeked` event never came. */
export const SEEK_TIMEOUT = 1500;
/** A paused element within this of its target is not seeked again (about one frame at 30 fps). */
const SAME_FRAME = 0.034;
/** Pressing play this close to the end starts from the beginning. */
const END_SLACK = 0.05;
/** `gentle` mode: how far an element may stray, and the least time between two corrective seeks of one element. */
export const GENTLE_DRIFT = 0.8;
export const GENTLE_GAP_MS = 1000;
/** `gentle` mode keeps fewer videos alive: iOS Safari decodes only a few at once and publishes no number. */
export const GENTLE_MAX_VIDEOS = 3;

export const clampRate = (r: number): number => Math.min(Math.max(r, RATE_MIN), RATE_MAX);

export interface TransportDeps {
  /** Tests: makes the elements (see `PoolOptions.create`). */
  create?: PoolOptions['create'];
  maxVideos?: number;
  now?: () => number;
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
}

const isMediaEl = (el: PoolEntry['el']): el is HTMLMediaElement => 'play' in el;

export function createTransportWith(o: TransportOptions, deps: TransportDeps = {}): Transport {
  const now = deps.now ?? (() => performance.now());
  const raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = deps.caf ?? ((id) => cancelAnimationFrame(id));

  let base = 0; // edit time at `since`
  let since = 0; // clock reading when playing began
  let playing = false;
  let frame = 0;
  let master = 1;
  let disposed = false;
  let waiting = new Set<PoolEntry>();
  let pictureQueued = false;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  const gentle = !!o.gentle;
  const limit = gentle ? GENTLE_DRIFT : DRIFT_LIMIT;
  const lastFix = new WeakMap<PoolEntry, number>();
  /**
   * How long a seek of a PLAYING element takes to land (call to `seeked`), smoothed. A corrective seek aims that far ahead:
   * otherwise the element resumes exactly that far behind the clock, drifts past the limit again, and is seeked again
   * every second, each time freezing the picture (measured in WebKit: one freeze per second, forever).
   */
  let seekLatency = 0;
  const seekStart = new WeakMap<PoolEntry, number>();

  const length = (): number => {
    const p = o.getProject();
    return editLength(p, total(p.clips));
  };
  const clock = (): number => Math.min(Math.max(playing ? base + (now() - since) / 1000 : base, 0), length());

  function frameReady(): void {
    waiting = new Set();
    if (waitTimer !== undefined) clearTimeout(waitTimer);
    waitTimer = undefined;
    if (!disposed) o.hooks.onFrame();
  }

  const pool: MediaPool = createPool({
    files: o.files,
    sink: o.sink,
    create: deps.create,
    maxVideos: deps.maxVideos,
    onPicture: () => {
      // A loaded image or a freshly decoded frame changes the picture without a seek; repaint once per animation frame.
      if (playing || disposed || pictureQueued) return;
      pictureQueued = true;
      raf(() => {
        pictureQueued = false;
        if (!playing && !disposed) o.hooks.onFrame();
      });
    },
    onSettled: (e) => {
      const began = seekStart.get(e);
      if (began !== undefined) {
        seekStart.delete(e);
        const d = Math.min(Math.max((now() - began) / 1000, 0), 1);
        seekLatency = seekLatency === 0 ? d : seekLatency * 0.5 + d * 0.5;
      }
      if (waiting.delete(e) && waiting.size === 0) frameReady();
    },
  });

  function seekEl(e: PoolEntry, t: number): void {
    const el = e.el;
    if (!isMediaEl(el)) return;
    if (el.readyState < 1) {
      e.wantTime = t; // applied on loadedmetadata by the pool
      e.seeking = true;
      return;
    }
    e.seeking = true;
    seekStart.set(e, now());
    el.currentTime = t;
  }

  function startEl(e: PoolEntry, started: Promise<unknown>[]): void {
    const el = e.el;
    if (!isMediaEl(el) || !el.paused || e.blocked) return;
    // play() on an ended element seeks it to 0 (HTML spec, internal play steps), so an element at its end stays paused.
    if (el.ended) return;
    try {
      const p = el.play();
      if (p) {
        started.push(
          p.catch((err: unknown) => {
            if ((err as { name?: string })?.name === 'NotAllowedError') e.blocked = true;
            throw err;
          }),
        );
      }
    } catch (err) {
      started.push(Promise.reject(err));
    }
  }

  function applyOutput(e: PoolEntry, item: ScheduledItem): void {
    const el = e.el;
    if (!isMediaEl(el)) return;
    const rate = clampRate(item.speed);
    if (e.rate !== rate || el.playbackRate !== rate) {
      el.preservesPitch = true;
      el.playbackRate = rate;
      e.rate = rate;
    }
    const v = item.volume * master;
    const gain = pool.gainOf(e);
    if (gain) gain.gain.value = v;
    else el.volume = v;
  }

  /**
   * Make the elements agree with the edit at time `t`. `force` seeks every
   * active element (a jump); otherwise only those that drifted. Returns the
   * elements a paused jump has to wait for and the pending play() promises.
   */
  function reconcile(t: number, force: boolean): { seeks: PoolEntry[]; started: Promise<unknown>[] } {
    const p = o.getProject();
    const active = activeItems(p, t);
    const up = upcomingItems(p, t, LOOKAHEAD);
    const activeIds = new Set(active.map((i) => i.itemId));
    const keep = new Set([...activeIds, ...up.map((i) => i.itemId)]);
    pool.retain(keep);
    const seeks: PoolEntry[] = [];
    const started: Promise<unknown>[] = [];

    for (const item of active) {
      const e = pool.acquire(item, activeIds);
      if (!e || !isMediaEl(e.el)) continue;
      const el = e.el;
      if (item.kind !== 'image') {
        const wanted = item.expectedSourceTime;
        // A pinned target (held at 0 or at the file's end) is not chased: the element waits on that frame.
        const needs = force
          ? !e.primed || Math.abs(el.currentTime - wanted) > SAME_FRAME
          : !e.seeking && (!e.primed || (playing && !item.pinned && Math.abs(el.currentTime - wanted) > limit && (!gentle || now() - (lastFix.get(e) ?? -Infinity) >= GENTLE_GAP_MS)));
        if (needs) {
          perfBump(force ? 'seek' : 'fix');
          if (gentle && !force) lastFix.set(e, now());
          seekEl(e, gentle && !force && playing ? wanted + seekLatency : wanted);
          if (force || !playing) seeks.push(e);
        }
        e.primed = true;
        applyOutput(e, item);
        if (playing && !item.pinned) startEl(e, started);
        else if (item.pinned && !el.paused) el.pause();
        else if (!el.paused) el.pause();
      }
    }
    // Preload what is about to start, parked on its first frame and silent.
    for (const item of up) {
      if (activeIds.has(item.itemId)) continue;
      const e = pool.acquire(item, activeIds);
      if (!e || !isMediaEl(e.el)) continue;
      if (!e.primed && item.kind !== 'image') {
        seekEl(e, item.expectedSourceTime);
        e.primed = true;
      }
      if (!e.el.paused) e.el.pause();
    }
    return { seeks, started };
  }

  function tick(): void {
    frame = 0;
    if (!playing || disposed) return;
    const t = clock();
    if (t >= length()) {
      base = length();
      playing = false;
      pool.pauseAll();
      o.hooks.onFrame();
      o.hooks.onEnded();
      return;
    }
    const { started } = reconcile(t, false);
    swallow(started);
    o.hooks.onFrame();
    frame = raf(tick);
  }

  /** Play() rejections inside the loop must never escape it. */
  function swallow(ps: Promise<unknown>[]): void {
    for (const p of ps) p.catch(() => undefined);
  }

  function jump(t: number): void {
    if (waitTimer !== undefined) clearTimeout(waitTimer);
    base = Math.min(Math.max(t, 0), length());
    since = now();
    waiting = new Set();
    const { seeks, started } = reconcile(base, true);
    swallow(started);
    const pending = seeks.filter((e) => e.seeking);
    if (pending.length === 0) {
      if (!playing) o.hooks.onFrame();
      return;
    }
    if (playing) return; // the running loop calls onFrame every frame
    waiting = new Set(pending);
    waitTimer = setTimeout(frameReady, SEEK_TIMEOUT);
  }

  const self: Transport = {
    get time() {
      return clock();
    },
    get playing() {
      return playing;
    },
    seek: (t) => {
      if (disposed) return;
      jump(t);
    },
    async play() {
      if (disposed || playing) return;
      const len = length();
      if (len <= 0) return;
      if (clock() >= len - END_SLACK) base = 0;
      for (const e of pool.entries()) e.blocked = false; // a new user gesture may now be allowed to play
      since = now();
      playing = true;
      const { started } = reconcile(base, true);
      const results = await Promise.allSettled(started);
      const refused = results.find((r) => r.status === 'rejected' && (r.reason as { name?: string })?.name === 'NotAllowedError') as PromiseRejectedResult | undefined;
      if (refused) {
        self.pause();
        throw refused.reason;
      }
      if (playing && !frame) frame = raf(tick);
    },
    pause() {
      if (playing) base = clock();
      playing = false;
      if (frame) caf(frame);
      frame = 0;
      pool.pauseAll();
      if (!disposed) o.hooks.onFrame();
    },
    resync() {
      if (disposed) return;
      if (playing) swallow(reconcile(clock(), false).started);
      else jump(base);
    },
    setMasterVolume(v) {
      master = Math.min(Math.max(v, 0), 1);
      if (!playing) return;
      const t = clock();
      for (const item of activeItems(o.getProject(), t)) {
        const e = pool.get(item.itemId);
        if (e) applyOutput(e, item);
      }
    },
    dispose() {
      disposed = true;
      playing = false;
      if (frame) caf(frame);
      frame = 0;
      if (waitTimer !== undefined) clearTimeout(waitTimer);
      pool.dispose();
    },
    picture: (id) => pool.picture(id),
  };
  return self;
}

export const createTransport: CreateTransport = (o) => createTransportWith(o, o.gentle ? { maxVideos: GENTLE_MAX_VIDEOS } : {});
