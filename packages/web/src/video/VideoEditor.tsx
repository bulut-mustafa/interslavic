import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { DropZone } from '../components/DropZone.tsx';
import { ReplaceBanner } from '../components/ReplaceBanner.tsx';
import { useToolActive } from '../studio/active.tsx';
import { useLibrary, useReportVideoTarget, useVideoLibraryOpen, type LibraryItem, type OpenMode } from '../studio/library.tsx';
import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { useVoices, VoicePicker } from '../speech/Listen.tsx';
import { speak as speakAloud, stop as stopSpeaking, supported as canSpeak } from '../speech/voices.ts';
import { VoiceOver } from './voiceover.ts';
import { downloadBlob } from '../download.ts';
import { Inspector } from '../editor/Inspector.tsx';
import { MediaInspector } from '../editor/MediaInspector.tsx';
import { EffectsPanel } from '../editor/EffectsPanel.tsx';
import { KeyframePanel } from '../editor/KeyframePanel.tsx';
import { SpeedAudioPanel } from '../editor/SpeedAudioPanel.tsx';
import { TransitionPicker } from '../editor/TransitionPicker.tsx';
import { TransformBox } from '../editor/TransformBox.tsx';
import { boxOfMedia, patchOfBox } from '../editor/transform-math.ts';
import { LayerCanvas, type SceneHandle } from '../editor/LayerCanvas.tsx';
import { SelectionOverlay, type View } from '../editor/SelectionOverlay.tsx';
import { askToKeep } from '../studio/idb.ts';
import * as H from '../editor/history.ts';
import { duplicateLayer, newId, newLayer, stepOrder, updateStyle, type StepKind, type TextLayer } from '../editor/layers.ts';
import { applyPreset } from '../editor/text-style.ts';
import { parseSrt } from '../subtitles/srt.ts';
import { translateTexts, type Script, type SourceLang } from '../subtitles/translate.ts';
import { defaultTextStyle, layersFromCues } from './cue-layers.ts';
import type { ChangeMode, FrameStrip, ProjectChange, Selection, Transport } from './contracts.ts';
import { exportVideo } from './export.ts';
import { grabStrip } from './frames.ts';
import { MODELS, type WhisperModel } from '../transcribe/models.ts';
import { Elapsed } from '../transcribe/Elapsed.tsx';
import { stageFraction, stageText, transcribeFile, type Deps, type Stage } from '../transcribe/run.ts';
import {
  editLength, emptyProject, isAudio, isMedia, isText, sourceOf, trackOf,
  type AudioLayer, type Layer, type MediaLayer, type Source, type VideoProject as Project,
} from './project.ts';
import { extractAudioLayer } from './audio.ts';
import { freezeFrame, freezeSourceTime, insertFreeze } from './freeze.ts';
import { autoKey, resolve } from './keyframes.ts';
import { createSourceFiles, kindOfFile, probeSource } from './sources.ts';
import { maxDuration } from './transitions.ts';
import { defaultVideoStore, type VideoStore } from './store.ts';
import { Timeline } from './Timeline.tsx';
import { topTrack } from './timeline-math.ts';
import { createTransport } from './transport.ts';
import './editor.css';
import { MIN_CLIP, length as clipLength, locate, removeClip, speedOf, splitAt, startOf, total, trim, type Clip } from './timeline.ts';

/** The longest side of the working frame: bigger videos are shown, and exported, at this size. */
const MAX_SIDE = 1280;

const LANGS: { value: SourceLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

const clock = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const readText = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });

/** Changes one layer of any kind. */
const patchLayer = (layers: Layer[], id: string, patch: object): Layer[] => layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));

/** The picture size of the finished video: the chosen frame, else the first video's own size, scaled down to MAX_SIDE. */
function frameOf(p: Project): { w: number; h: number } {
  if (p.frame) return p.frame;
  const first = p.clips[0];
  const src = first ? sourceOf(p, first.srcId) : undefined;
  if (src?.w && src?.h) {
    const k = Math.min(1, MAX_SIDE / Math.max(src.w, src.h));
    return { w: Math.round(src.w * k), h: Math.round(src.h * k) };
  }
  return { w: 1280, h: 720 };
}

/** A new picture or video layer of a source, centred and about half the frame, at `start`. */
function mediaLayerOf(src: Source, frame: { w: number; h: number }, start: number, lane: number): MediaLayer {
  const sw = src.w || frame.w * 0.4;
  const sh = src.h || frame.h * 0.4;
  const k = Math.min((frame.w * 0.5) / sw, (frame.h * 0.5) / sh);
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const len = src.kind === 'image' ? 5 : Math.max(0.5, src.duration ?? 5);
  return { id: newId('m'), kind: 'media', srcId: src.id, in: 0, start, end: start + len, track: lane, x: Math.round((frame.w - w) / 2), y: Math.round((frame.h - h) / 2), w, h, rotation: 0, opacity: 1, blend: 'normal' };
}

const EMPTY_FEED = { picture: () => null };

/**
 * A video editor: several videos one after another on the main track, pictures,
 * videos and sounds placed over or beside them on lanes, and styled text - all
 * timed by dragging on the timeline. Subtitles can be brought in, made from the
 * speech, and translated into Interslavic. It all runs in the browser; nothing
 * leaves the device.
 */
export default function VideoEditor({ store = defaultVideoStore, makeTranscriber, decodeAudio }: Deps & { store?: VideoStore | null } = {}) {
  const [hist, setHist] = useState<H.History<Project>>(() => H.start(emptyProject()));
  const [sel, setSel] = useState<Selection>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [voiceOver, setVoiceOver] = useState(false);
  const { voice } = useVoices();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const volumeRef = useRef(1);
  volumeRef.current = volume;
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const ducked = useRef(false);
  const transportRef = useRef<Transport | null>(null);
  const applyVolume = () => transportRef.current?.setMasterVolume(mutedRef.current ? 0 : volumeRef.current * (ducked.current ? 0.25 : 1));
  const [reader] = useState(
    () =>
      new VoiceOver({
        speak: (text, onEnd) => {
          const v = voiceRef.current;
          if (v) speakAloud(text, v, onEnd);
          else onEnd();
        },
        stop: stopSpeaking,
        duck: (on) => {
          ducked.current = on;
          applyVolume();
        },
      }),
  );
  const voiceOverOn = useRef(false);
  voiceOverOn.current = voiceOver;
  const [lang, setLang] = useState<SourceLang>('en');
  const [script, setScript] = useState<Script>('standard');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<{ at: number; of: number } | null>(null);
  const [typing, setTyping] = useState(false);
  const [strips, setStrips] = useState<FrameStrip[]>([]);
  const [zoom, setZoom] = useState(60);
  const [snapping, setSnapping] = useState(true);
  const [view, setView] = useState<View | null>(null);
  /** Asking, before captions are made, because the speech model is a big download the first time. */
  const [askCaptions, setAskCaptions] = useState(false);
  const [capModel, setCapModel] = useState<WhisperModel['id']>('small');
  const [captioning, setCaptioning] = useState<Stage | null>(null);
  const [restoring, setRestoring] = useState(store !== null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [kept, setKept] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [transport, setTransport] = useState<Transport | null>(null);
  /** The clip after a join whose transition is being chosen. */
  const [joint, setJoint] = useState<string | null>(null);

  const lib = useLibrary();
  const active = useToolActive();
  const [incoming, setIncoming] = useState<{ file: File; item: LibraryItem | null } | null>(null);
  const [files] = useState(() => createSourceFiles());
  const scene = useRef<SceneHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const dragBase = useRef<Project | null>(null);
  const lastTick = useRef(0);
  const capAbort = useRef<AbortController | null>(null);
  const writes = useRef(0);
  const grabbed = useRef(new Set<string>());
  const stripCtl = useRef(new AbortController());
  /** Set once the person has started something, so a slow restore of the saved edit cannot replace it. */
  const touched = useRef(false);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);

  const project = hist.present;
  const { sources, clips, layers } = project;
  const projectRef = useRef(project);
  projectRef.current = project;
  const ready = clips.length > 0;
  const commit = (next: Partial<Project>) => setHist((h) => H.push(h, { ...h.present, ...next }));
  /** Like commit, but a run of changes to the same thing within a moment (a slider being dragged, typing) is ONE undo step. */
  const commitMerge = (key: string, next: Partial<Project>) =>
    setHist((h) => {
      const now = Date.now();
      const same = lastCommit.current?.key === key && now - lastCommit.current.at < 600;
      lastCommit.current = { key, at: now };
      return same ? H.replace(h, { ...h.present, ...next }) : H.push(h, { ...h.present, ...next });
    });

  const length = editLength(project, total(clips));
  const frame = useMemo(() => frameOf(project), [project.frame, project.clips[0]?.srcId, sources]);
  const selClip = sel?.kind === 'clip' ? (clips.find((c) => c.id === sel.id) ?? null) : null;
  const clipIndex = selClip ? clips.indexOf(selClip) : -1;
  const selLayer = sel?.kind === 'layer' ? (layers.find((l) => l.id === sel.id) ?? null) : null;
  const textLayer = selLayer && isText(selLayer) ? selLayer : null;
  const mediaLayer = selLayer && isMedia(selLayer) ? selLayer : null;
  const audioLayer = selLayer && isAudio(selLayer) ? selLayer : null;
  const textLayers = useMemo(() => layers.filter(isText), [layers]);
  const jointIndex = joint ? clips.findIndex((c) => c.id === joint) : -1;

  /** A layer as it is at the playhead: values that have keyframes are what the keyframes give now. */
  const nowOf = <L extends Layer>(l: L): L => resolve(l as Parameters<typeof resolve>[0], time - (l.start ?? 0)) as L;
  /** A change to a layer. Where the layer has keyframes, a changed value that is animated becomes a key at the playhead. */
  const keyed = (l: Layer, patch: object): object => {
    if (!l.tracks?.length) return patch;
    const { tracks, rest } = autoKey(l.tracks, patch, time - (l.start ?? 0));
    return { ...rest, tracks };
  };
  const patchKeyed = (ls: Layer[], id: string, patch: object): Layer[] => ls.map((l) => (l.id === id ? ({ ...l, ...keyed(l, patch) } as Layer) : l));
  const shownText = useMemo(() => textLayers.filter((l) => time >= (l.start ?? 0) && time < (l.end ?? Infinity)), [textLayers, time]);
  /** The selected text, when it is on the frame being shown: what the toolbar can sit next to. */
  const onFrame = useMemo(() => (textLayer && shownText.some((l) => l.id === textLayer.id) ? [textLayer] : []), [textLayer, shownText]);
  useEffect(() => {
    if (!textLayer) setTyping(false);
  }, [textLayer]);

  /** Writes to the saved copy, and says how it went. A failure (usually a full disk, with a big video) is shown, not hidden. */
  const keep = (job: () => Promise<void>) => {
    if (!store) return;
    const mine = ++writes.current;
    setKept('saving');
    job()
      .then(() => {
        if (mine === writes.current) setKept('saved');
      })
      .catch(() => {
        if (mine === writes.current) setKept('failed');
      });
  };

  // Bring back what was open last time.
  useEffect(() => {
    if (!store) return;
    let live = true;
    store
      .load()
      .then(async (saved) => {
        if (!live || !saved || touched.current) return;
        const probed = new Map<string, Source>();
        for (const [id, f] of saved.files) {
          files.add(id, f);
          const s = saved.record.hist.present.sources.find((x) => x.id === id);
          // An edit saved before sources carried their size and length gets them now.
          if (s && (s.kind !== 'image' ? s.duration === undefined : s.w === undefined)) {
            try {
              probed.set(id, { ...(await probeSource(f, undefined, id)), name: s.name });
            } catch {
              /* the file stays as it was; the project is not lost */
            }
          }
        }
        if (!live || touched.current) return;
        // A file that was kept under the old single-video key is kept again under its own key, once.
        if (saved.migrated) for (const [id, f] of saved.files) keep(() => store.saveSource(id, f));
        const fill = (p: Project): Project => {
          const withSources = probed.size === 0 ? p : { ...p, sources: p.sources.map((s) => probed.get(s.id) ?? s) };
          // A clip never runs past the end of its own video, whatever was saved.
          const lim = (c: Clip): Clip => {
            const d = sourceOf(withSources, c.srcId)?.duration;
            return d !== undefined && c.end > d ? { ...c, end: d, start: Math.min(c.start, Math.max(0, d - MIN_CLIP)) } : c;
          };
          return { ...withSources, clips: withSources.clips.map(lim) };
        };
        const h = saved.record.hist;
        setHist({ past: h.past.map(fill), present: fill(h.present), future: h.future.map(fill) });
        setLang(saved.record.lang);
        setScript(saved.record.script);
        setMuted(saved.record.muted ?? false);
        setVolume(saved.record.volume ?? 1);
        setVoiceOver(saved.record.voiceOver ?? false);
        const first = [...saved.files.values()][0];
        if (first) lib.markOpened(lib.add([first])[0]?.id ?? null);
        if (saved.missing.length > 0) setError(`${saved.missing.length === 1 ? 'A file' : `${saved.missing.length} files`} used by this edit could not be found on this device. The rest is here.`);
      })
      .catch(() => live && setRestoreFailed(true))
      .finally(() => live && setRestoring(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => files.dispose(), [files]);

  // The player exists while there is something to play.
  useEffect(() => {
    if (!ready) return;
    const t = createTransport({
      getProject: () => projectRef.current,
      files,
      hooks: {
        onFrame: () => {
          scene.current?.redraw();
          const now = performance.now();
          if (t.playing && voiceOverOn.current) reader.update(t.time, projectRef.current.layers.filter(isText), editLength(projectRef.current, total(projectRef.current.clips)));
          if (now - lastTick.current > 80 || !t.playing) {
            lastTick.current = now;
            setTime(t.time);
          }
        },
        onEnded: () => setPlaying(false),
      },
    });
    transportRef.current = t;
    setTransport(t);
    applyVolume();
    t.seek(0);
    return () => {
      t.dispose();
      transportRef.current = null;
      setTransport(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, files]);

  // The edit changed under the player: show the right picture and keep the right sound going.
  useEffect(() => {
    transport?.resync();
  }, [project, transport]);
  useEffect(() => {
    applyVolume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, volume, transport]);

  // Moving to another tool must not leave a video playing out of sight.
  useEffect(() => {
    if (!active) {
      transportRef.current?.pause();
      setPlaying(false);
    }
  }, [active]);

  // The playhead never sits past the end of an edit that got shorter.
  useEffect(() => {
    if (time > length + 0.01) seek(length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  // The edit is kept as it changes, a moment after the last change.
  useEffect(() => {
    if (!store || !ready) return;
    const t = setTimeout(() => {
      keep(() => store.saveRecord({ version: 2, hist, lang, script, muted, volume, voiceOver }));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, lang, script, muted, volume, voiceOver, ready]);

  // Little pictures along each video, for the timeline. One controller for the editor's whole life (a new file must not cancel the pictures of an earlier one).
  useEffect(() => {
    stripCtl.current = new AbortController();
    const ctl = stripCtl.current;
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    const signal = stripCtl.current.signal;
    for (const s of sources) {
      const url = files.urlOf(s.id);
      if (!url || grabbed.current.has(s.id)) continue;
      grabbed.current.add(s.id);
      void grabStrip(s.id, url, s.duration ?? 0, signal, s.kind)
        .then((strip) => {
          if (signal.aborted) grabbed.current.delete(s.id);
          else setStrips((all) => [...all.filter((x) => x.srcId !== s.id), strip]);
        })
        .catch(() => grabbed.current.delete(s.id));
    }
  }, [sources, files]);

  // Leaving the editor stops anything still running for it: a save, or captions being made.
  useEffect(
    () => () => {
      abort.current?.abort();
      capAbort.current?.abort();
    },
    [],
  );

  // The voice is for a playing preview: pausing, or turning it off, silences it at once.
  useEffect(() => {
    if (!playing || !voiceOver) reader.halt();
  }, [playing, voiceOver, reader]);
  useEffect(() => () => reader.halt(), [reader]);

  const seek = (t: number) => {
    const clamped = Math.min(Math.max(t, 0), length);
    transportRef.current?.seek(clamped);
    reader.arm(clamped);
    setTime(clamped);
  };

  const togglePlay = async () => {
    const t = transportRef.current;
    if (!t) return;
    if (t.playing) {
      t.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      reader.arm(t.time >= length - 0.05 ? -0.001 : t.time - 0.001);
      try {
        await t.play();
      } catch {
        setPlaying(false);
      }
    }
  };

  /**
   * An edit from the timeline or the canvas. A drag sends `preview` for every
   * move and `end` once, and becomes ONE undo step; anything else commits at once.
   */
  const change = (c: ProjectChange, mode: ChangeMode) => {
    if (mode === 'preview') {
      dragBase.current ??= projectRef.current;
      setHist((h) => H.replace(h, { ...h.present, ...c }));
      return;
    }
    const base = dragBase.current;
    dragBase.current = null;
    if (mode === 'end' && base) setHist((h) => H.commitFrom(h, base));
    else if (Object.keys(c).length > 0) commit(c);
  };

  // ---- bringing files in ----

  /** A first video: starts a new edit. */
  const startFresh = async (file: File, item: LibraryItem | null) => {
    if (exporting) return;
    touched.current = true;
    setIncoming(null);
    setError(null);
    setStatus(null);
    try {
      const source = await probeSource(file);
      if (source.kind !== 'video' || !source.duration) throw new Error('Start with a video: pictures and sounds are added once a video is open.');
      for (const s of projectRef.current.sources) files.remove(s.id);
      grabbed.current.clear();
      setStrips([]);
      files.add(source.id, file);
      setHist(H.start({ ...emptyProject(), sources: [source], clips: [{ id: newId('c'), start: 0, end: source.duration, srcId: source.id }] }));
      setSel(null);
      setTime(0);
      setPlaying(false);
      if (store) keep(async () => {
        await store.clear(); // the old edit does not belong to the new video
        await store.saveSource(source.id, file);
        void askToKeep();
      });
      lib.markOpened(item?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** More files into the edit they are added to: videos at the end of the main track, pictures and sounds over it at the playhead. */
  const addFiles = async (list: File[], mode: OpenMode | undefined) => {
    if (exporting) return;
    touched.current = true;
    setError(null);
    setStatus(null);
    for (const file of list) {
      try {
        if (!kindOfFile(file)) throw new Error(`${file.name} is not a video, picture or sound.`);
        const source = await probeSource(file);
        files.add(source.id, file);
        if (store) keep(() => store.saveSource(source.id, file));
        const p = projectRef.current;
        const next: Project = { ...p, sources: [...p.sources, source] };
        let pick: Selection = null;
        let at = 0;
        if (source.kind === 'video' && mode !== 'overlay') {
          const clip: Clip = { id: newId('c'), start: 0, end: source.duration ?? 1, srcId: source.id };
          at = total(p.clips);
          next.clips = [...p.clips, clip];
          pick = { kind: 'clip', id: clip.id };
        } else if (source.kind === 'audio') {
          const l: AudioLayer = { id: newId('a'), kind: 'audio', srcId: source.id, in: 0, start: time, end: time + (source.duration ?? 5), track: topTrack(p) + 1 };
          next.layers = [...p.layers, l];
          pick = { kind: 'layer', id: l.id };
          at = time;
        } else {
          const l = mediaLayerOf(source, frameOf(p), time, topTrack(p) + 1);
          next.layers = [...p.layers, l];
          pick = { kind: 'layer', id: l.id };
          at = time;
        }
        setHist((h) => H.push(h, next));
        setSel(pick);
        projectRef.current = next;
        seek(at);
        track('video-add', { kind: source.kind, mode: mode ?? 'append' });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  /** A file chosen anywhere - the drop zone, the Uploads sheet - lands here. */
  const requestOpen = (file: File, item?: LibraryItem, mode?: OpenMode) => {
    if (exporting) return;
    const it = item ?? lib.add([file])[0] ?? null;
    if (ready && (mode === 'append' || mode === 'overlay')) {
      void addFiles([file], mode);
      lib.markOpened(it?.id ?? null);
    } else if (ready && H.canUndo(hist)) setIncoming({ file, item: it });
    else void startFresh(file, it);
  };
  useVideoLibraryOpen((item, mode) => requestOpen(item.file, item, mode));
  useReportVideoTarget(ready);

  // ---- editing ----

  const split = () => {
    const next = splitAt(clips, time);
    if (next !== clips) commit({ clips: next });
  };

  /** The selected thing removed. The last clip of the main track stays. */
  const removeSelected = () => {
    if (selLayer) commit({ layers: layers.filter((l) => l.id !== selLayer.id) });
    else if (selClip && clips.length > 1) commit({ clips: removeClip(clips, clipIndex) });
    else return;
    setSel(null);
  };

  /** A speed change on a layer changes how long it is on the edit (twice as fast, half as long), never past the end of its file. */
  const withSpeed = (l: MediaLayer | AudioLayer, patch: object): object => {
    const nu = (patch as { speed?: number }).speed;
    if (nu === undefined) return patch;
    let end = l.start + ((l.end - l.start) * (l.speed ?? 1)) / nu;
    const src = sourceOf(project, l.srcId);
    if (src?.duration !== undefined && src.kind !== 'image') end = Math.min(end, l.start + Math.max(0.2, (src.duration - l.in) / nu));
    return { ...patch, end };
  };

  const duplicateSelected = () => {
    if (!selLayer) return;
    const lane = topTrack(project) + 1;
    const copy: Layer = isText(selLayer)
      ? { ...duplicateLayer([selLayer], selLayer.id)[1]!, track: lane }
      : { ...selLayer, id: newId('m'), track: lane, ...(isMedia(selLayer) ? { x: selLayer.x + 24, y: selLayer.y + 24 } : {}) };
    commit({ layers: [...layers, copy] });
    setSel({ kind: 'layer', id: copy.id });
  };

  /** Order is the lane: higher lanes are in front. */
  const orderSelected = (kind: StepKind) => {
    if (!selLayer) return;
    const lane = trackOf(selLayer);
    // The highest lane among the OTHER layers: already above it, "front" and "forward" change nothing (no creeping lane numbers).
    const topOthers = layers.reduce((n, l) => (l.id === selLayer.id ? n : Math.max(n, trackOf(l))), -1);
    const to = kind === 'front' ? Math.max(lane, topOthers + 1) : kind === 'back' ? 0 : kind === 'forward' ? Math.min(lane + 1, Math.max(lane, topOthers + 1)) : Math.max(0, lane - 1);
    commit({ layers: stepOrder(patchLayer(layers, selLayer.id, { track: to }), selLayer.id, kind === 'front' || kind === 'forward' ? 'front' : 'back') });
  };

  /** Back to the first video, whole, with nothing laid over it. It goes through the history, so Undo brings it all back. */
  const clearAll = () => {
    // The first VIDEO of the edit (a still held at the very start can be the first clip, and has no length of its own).
    const firstVideo = sources.find((x) => x.kind === 'video' && x.duration);
    if (!firstVideo?.duration) return;
    commit({ clips: [{ id: newId('c'), start: 0, end: firstVideo.duration, srcId: firstVideo.id }], layers: [] });
    setSel(null);
  };
  const first = clips[0] ? sourceOf(project, clips[0].srcId) : undefined;
  const firstVideoSrc = sources.find((x) => x.kind === 'video' && x.duration);
  const nothingToClear = layers.length === 0 && clips.length === 1 && !!firstVideoSrc && clips[0]!.srcId === firstVideoSrc.id && clips[0]!.start <= 0.01 && clips[0]!.end >= (firstVideoSrc.duration ?? 0) - 0.01;

  /** The picture at the playhead as a still: a 3-second clip of its own, with the video cut around it. */
  const freeze = async () => {
    const at = freezeSourceTime(projectRef.current.clips, time);
    const url = at && files.urlOf(at.srcId);
    // Only a video has a frame to take: a still on the main track already is one.
    if (!at || !url || sourceOf(projectRef.current, at.srcId)?.kind !== 'video') return;
    setError(null);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    try {
      await new Promise<void>((ok, bad) => {
        video.onloadeddata = () => ok();
        video.onerror = () => bad(new Error('The video could not be read to take a still from it.'));
      });
      const blob = await freezeFrame(video, at.time);
      const file = new File([blob], 'Freeze frame.png', { type: 'image/png' });
      const source = await probeSource(file);
      files.add(source.id, file);
      if (store) keep(() => store.saveSource(source.id, file));
      const p = projectRef.current;
      commit({ sources: [...p.sources, source], clips: insertFreeze(p.clips, time, source.id, 3) });
      track('video-freeze');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  };

  /** The sound of the selected clip or video layer onto a lane of its own, and the picture's own sound muted. */
  const extractSound = () => {
    const lane = topTrack(project) + 1;
    if (selClip?.srcId) {
      const { layer, mute } = extractAudioLayer({ srcId: selClip.srcId, in: selClip.start, editStart: startOf(clips, clipIndex), editLength: clipLength(selClip), speed: speedOf(selClip), volume: selClip.volume, fadeIn: selClip.fadeIn, fadeOut: selClip.fadeOut, track: lane });
      commit({ layers: [...layers, layer], clips: clips.map((c) => (c.id === selClip.id ? { ...c, ...mute } : c)) });
    } else if (mediaLayer) {
      const { layer, mute } = extractAudioLayer({ srcId: mediaLayer.srcId, in: mediaLayer.in, editStart: mediaLayer.start, editLength: mediaLayer.end - mediaLayer.start, speed: mediaLayer.speed, volume: mediaLayer.volume, fadeIn: mediaLayer.fadeIn, fadeOut: mediaLayer.fadeOut, track: lane });
      commit({ layers: [...patchLayer(layers, mediaLayer.id, mute), layer] });
    }
  };
  const selSourceKind = sourceOf(project, selClip?.srcId ?? mediaLayer?.srcId)?.kind;
  const atPlayhead = freezeSourceTime(clips, time);
  const canFreeze = !!atPlayhead && sourceOf(project, atPlayhead.srcId)?.kind === 'video';

  const addText = () => {
    const l = newLayer({
      x: frame.w * 0.1,
      y: frame.h * 0.4,
      maxWidth: frame.w * 0.8,
      start: time,
      end: Math.min(length, time + 3),
      style: defaultTextStyle(frame.h),
      track: topTrack(project) + 1,
    });
    commit({ layers: [...layers, l] });
    setSel({ kind: 'layer', id: l.id });
  };

  const importSubtitles = async (f: File) => {
    try {
      const cues = parseSrt(await readText(f));
      const made = layersFromCues(cues, clips, frame, clips[0]?.srcId);
      if (made.layers.length === 0) {
        setStatus(cues.length === 0 ? 'No subtitles were found in that file.' : 'None of those subtitles fall in the part of the video you kept.');
        return;
      }
      const lane = topTrack(project) + 1;
      commit({ layers: [...layers, ...made.layers.map((l) => ({ ...l, track: lane }))] });
      setStatus(`Added ${made.layers.length} subtitles as text on the video${made.left ? `; ${made.left} fell in parts you cut and were left out` : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const translate = async (ids: string[]) => {
    const targets = textLayers.filter((l) => ids.includes(l.id) && l.text.trim() !== '');
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    setStatus('Translating…');
    try {
      const out = await translateTexts(targets.map((l) => l.text), { lang, script });
      let next = projectRef.current.layers;
      targets.forEach((l, i) => (next = patchLayer(next, l.id, { text: out[i]!.text, original: l.original ?? l.text })));
      commit({ layers: next });
      const doubtful = out.filter((r) => r.flagged).length;
      setStatus(`Translated ${targets.length} ${targets.length === 1 ? 'text' : 'texts'} into Interslavic.${doubtful ? ` ${doubtful} may be wrong - read ${doubtful === 1 ? 'it' : 'them'} before you save.` : ''}`);
      track('video-translate', { lang, script, texts: targets.length });
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** The speech in each video as text, timed to the original and placed on the parts that were kept. */
  const makeCaptions = async () => {
    if (!ready) return;
    const model = MODELS.find((m) => m.id === capModel)!;
    const ctl = new AbortController();
    capAbort.current = ctl;
    setAskCaptions(false);
    setError(null);
    setStatus(null);
    let added = 0;
    try {
      const used = [...new Set(projectRef.current.clips.map((c) => c.srcId).filter((id): id is string => !!id))];
      for (const id of used) {
        const file = files.fileOf(id);
        if (!file || sourceOf(projectRef.current, id)?.kind !== 'video') continue;
        const done = await transcribeFile(file, { lang, model, signal: ctl.signal, makeTranscriber, decodeAudio, onStage: setCaptioning });
        if (!done) return;
        const made = layersFromCues(done.cues, projectRef.current.clips, frame, id);
        if (made.layers.length > 0) {
          // The captions of this video go on one new lane; the next video's go on the one above, from the layers as they now are.
          const lane = topTrack(projectRef.current) + 1;
          const layersNow = [...projectRef.current.layers, ...made.layers.map((l) => ({ ...l, track: lane }))];
          projectRef.current = { ...projectRef.current, layers: layersNow };
          commit({ layers: layersNow });
          added += made.layers.length;
        }
      }
      setStatus(added === 0 ? 'No speech was found, or it is all in parts you cut, so there is nothing to add.' : `Added ${added} captions from the speech. They are only as good as what was heard: read them, then translate.`);
      track('video-captions', { lang, model: capModel, captions: added });
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCaptioning(null);
    }
  };

  const save = async () => {
    if (!ready) return;
    transportRef.current?.pause();
    setPlaying(false);
    setError(null);
    setStatus(null);
    const ctl = new AbortController();
    abort.current = ctl;
    setExporting({ at: 0, of: length });
    try {
      const { blob, mime } = await exportVideo({
        project,
        files,
        size: frame,
        masterVolume: muted ? 0 : volume,
        signal: ctl.signal,
        onProgress: (at, of) => setExporting({ at, of }),
      });
      downloadBlob((first?.name ?? 'video').replace(/\.[^.]+$/, '') + '-edited.' + (mime.startsWith('video/mp4') ? 'mp4' : 'webm'), blob);
      setStatus('Saved. The new video is in your downloads.');
      track('video-save', { clips: clips.length, layers: layers.length });
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

  const busyOut = exporting !== null;

  /**
   * Keys that work anywhere on the page while this tool is shown, except while typing, and except where a control has its own use of
   * the key (a button takes Space, a slider and the timeline's items take the arrows). Delete, S, Cmd+D and Cmd+Z work even when a
   * timeline item or a button has the focus, which is where the focus is after most clicks.
   */
  const onKeys = (e: KeyboardEvent) => {
    if (!ready || busyOut) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const onControl = !!t?.closest('button, a, [role=slider], .tl');
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      setSel(null);
      setTyping(false);
    } else if (e.key === ' ' && !onControl) {
      e.preventDefault();
      void togglePlay();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    } else if (!mod && !e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      split();
    } else if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelected();
    } else if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      setHist((h) => (e.shiftKey ? H.redo(h) : H.undo(h)));
    } else if (!selLayer && !onControl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      seek(time + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30));
    }
  };
  const keysRef = useRef(onKeys);
  keysRef.current = onKeys;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active]);

  if (restoring) {
    return (
      <main className="editor-page">
        <p className="note" role="status">
          Getting your video back…
        </p>
      </main>
    );
  }

  return (
    <main className="editor-page">
      {!ready && (
        <>
          <h1>Video editor</h1>
          <p className="lesson-summary">Cut videos together and put pictures, sounds and text on them, even translated. The videos stay on your device.</p>
          {restoreFailed && (
            <p className="error-line" role="alert">
              Your saved video could not be read just now, so you are starting empty. It is still on this device and may come back after a reload.
            </p>
          )}
          <DropZone
            name="Video to edit"
            title="Drop a video here, or click to browse"
            hint="MP4, WebM, MOV"
            accept="video/*"
            kind="video"
            noun="a video"
            file={null}
            onFile={(f) => requestOpen(f)}
          />
          {error && (
            <p className="error-line" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {ready && (
        <div className="editor">
          <div className="editor-stage">
            {incoming && <ReplaceBanner noun="video" name={incoming.file.name} onReplace={() => void startFresh(incoming.file, incoming.item)} onKeep={() => setIncoming(null)} />}

            <div className="editor-bar" role="toolbar" aria-label="Video tools">
              <span className="editor-file" title={first?.name}>
                {first?.name}
              </span>
              <Tip label="Add a video, picture or sound" side="bottom">
                <label className={`icon-button open-another${busyOut ? ' is-disabled' : ''}`}>
                  <Icon name="plus" />
                  <input
                    type="file"
                    multiple
                    accept="video/*,image/*,audio/*"
                    aria-label="Add a video, picture or sound"
                    disabled={busyOut}
                    onChange={(e) => {
                      const list = [...(e.target.files ?? [])];
                      e.target.value = '';
                      if (list.length > 0) void addFiles(list, 'append');
                    }}
                  />
                </label>
              </Tip>
              <Tip label="Add text" side="bottom">
                <button type="button" className="icon-button" aria-label="Add text" onClick={addText} disabled={busyOut}>
                  <Icon name="addText" />
                </button>
              </Tip>
              <Tip label="Add subtitles (.srt)" side="bottom">
                <label className={`icon-button open-another${busyOut ? ' is-disabled' : ''}`}>
                  <Icon name="subtitles" />
                  <input
                    type="file"
                    accept=".srt,text/plain"
                    aria-label="Subtitles to add as text (.srt)"
                    disabled={busyOut}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importSubtitles(f);
                    }}
                  />
                </label>
              </Tip>
              <Tip label="Make captions from the speech" side="bottom">
                <button type="button" className="icon-button" aria-label="Make captions from the speech" aria-expanded={askCaptions} disabled={busyOut || captioning !== null} onClick={() => setAskCaptions((a) => !a)}>
                  <Icon name="mic" />
                </button>
              </Tip>
              <Tip label="Translate all text to Interslavic" side="bottom">
                <button type="button" className="icon-button" aria-label="Translate all text to Interslavic" disabled={busy || textLayers.length === 0 || busyOut} onClick={() => void translate(textLayers.map((l) => l.id))}>
                  <Icon name="translate" />
                </button>
              </Tip>
              <span className="editor-gap" />
              {store && kept === 'saved' && <span className="page-kept">Kept on this device</span>}
              <Tip label="Undo" side="bottom">
                <button type="button" className="icon-button" aria-label="Undo" disabled={!H.canUndo(hist) || busyOut} onClick={() => setHist((h) => H.undo(h))}>
                  <Icon name="undo" />
                </button>
              </Tip>
              <Tip label="Redo" side="bottom">
                <button type="button" className="icon-button" aria-label="Redo" disabled={!H.canRedo(hist) || busyOut} onClick={() => setHist((h) => H.redo(h))}>
                  <Icon name="redo" />
                </button>
              </Tip>
              <Tip label="Clear everything (all text and cuts)" side="bottom">
                <button type="button" className="icon-button" aria-label="Clear everything: all text and cuts" disabled={nothingToClear || busyOut} onClick={clearAll}>
                  <Icon name="trash" />
                </button>
              </Tip>
              {exporting ? (
                <button type="button" className="text-button" onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              ) : (
                <Tip label="Save video" side="bottom">
                  <button type="button" className="icon-button is-primary" aria-label="Save video" onClick={() => void save()}>
                    <Icon name="save" />
                  </button>
                </Tip>
              )}
            </div>

            {exporting && (
              <div role="status" className="export-progress">
                <div className="progress-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((exporting.at / Math.max(exporting.of, 0.001)) * 100)}%` }} />
                </div>
                <p className="note">Saving… {Math.round((exporting.at / Math.max(exporting.of, 0.001)) * 100)}%. The video is recorded at its own speed, so keep this tab open.</p>
              </div>
            )}

            {store && kept === 'failed' && (
              <p className="error-line" role="alert">
                Could not keep this video on this device (the browser may be out of room). Save it before you leave.
              </p>
            )}

            {askCaptions && (
              <div className="replace-banner caption-ask" role="dialog" aria-label="Make captions">
                <p>
                  Captions are made from the speech in the videos, <strong>on your device</strong>: nothing is uploaded. The first time, your browser downloads a speech model and keeps it. Quality depends on the language and the sound, so read the captions before you use them.
                </p>
                <div className="insp-line">
                  <label className="sub-field">
                    <span>Spoken language</span>
                    <select value={lang} onChange={(e) => setLang(e.target.value as SourceLang)} aria-label="Spoken language">
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sub-field">
                    <span>Model</span>
                    <select value={capModel} onChange={(e) => setCapModel(e.target.value as WhisperModel['id'])} aria-label="Speech model">
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.downloadMb} MB)
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="text-button is-primary" onClick={() => void makeCaptions()}>
                    <Icon name="mic" /> Make captions
                  </button>
                  <button type="button" className="text-button" onClick={() => setAskCaptions(false)}>
                    Not now
                  </button>
                </div>
              </div>
            )}

            {captioning && (
              <div role="status" className="transcribe-progress">
                <div className="progress-bar" aria-hidden="true">
                  <span className={stageFraction(captioning) === null ? 'is-moving' : undefined} style={stageFraction(captioning) === null ? undefined : { width: `${Math.round(stageFraction(captioning)! * 100)}%` }} />
                </div>
                <p>
                  {stageText(captioning)} <Elapsed />{' '}
                  <button type="button" className="text-button" onClick={() => capAbort.current?.abort()}>
                    Cancel
                  </button>
                </p>
              </div>
            )}

            <div className="canvas-wrap" ref={wrap} tabIndex={-1} inert={busyOut}>
              <LayerCanvas
                ref={scene}
                width={frame.w}
                height={frame.h}
                layers={shownText}
                project={project}
                media={transport ?? EMPTY_FEED}
                time={time}
                selectedId={sel?.kind === 'layer' ? sel.id : null}
                onSelect={(id) => {
                  setSel(id ? { kind: 'layer', id } : null);
                  setTyping(false);
                }}
                onActivate={(id) => {
                  setSel({ kind: 'layer', id });
                  setTyping(true);
                }}
                onDrag={(id, x, y) => change({ layers: patchKeyed(projectRef.current.layers, id, { x, y }) }, 'preview')}
                onDragEnd={() => change({}, 'end')}
                label="The video frame. Drag text to move it; arrow keys nudge the selected text; Enter types on it."
              />
              <SelectionOverlay
                scene={scene}
                wrap={wrap}
                active={onFrame}
                watch={[onFrame, frame, ready]}
                typing={typing}
                onView={setView}
                onType={(text) => commitMerge(`t:${textLayer!.id}`, { layers: patchLayer(layers, textLayer!.id, { text }) })}
                onStopTyping={() => setTyping(false)}
                toolbar={
                  <>
                    <button type="button" className="is-main" disabled={busy || busyOut} onClick={() => void translate([textLayer!.id])}>
                      <Icon name="translate" /> Translate
                    </button>
                    <button type="button" onClick={() => setTyping(true)}>
                      <Icon name="edit" /> Edit
                    </button>
                    <button type="button" aria-label="Remove this text" title="Remove this text" onClick={removeSelected}>
                      <Icon name="trash" />
                    </button>
                  </>
                }
              />
              {mediaLayer && view && (
                <TransformBox
                  box={boxOfMedia(nowOf(mediaLayer))}
                  view={view}
                  frame={frame}
                  label={`Selected ${sourceOf(project, mediaLayer.srcId)?.kind === 'image' ? 'picture' : 'video'}`}
                  onChange={(box, mode) => change({ layers: patchKeyed(projectRef.current.layers, mediaLayer.id, patchOfBox(box)) }, mode)}
                />
              )}
            </div>

            <div className="transport" inert={busyOut}>
              <button type="button" className="icon-button is-play" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()} disabled={busyOut}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <span className="transport-time">
                {clock(time)} / {clock(length)}
              </span>
              <span className="editor-gap" />
              <button type="button" className="icon-button" aria-label="Split at playhead" title="Split at playhead (S)" onClick={split} disabled={busyOut}>
                <Icon name="split" />
              </button>
              <button type="button" className="icon-button" aria-label="Freeze frame" title="Freeze frame: hold this picture for 3 seconds" onClick={() => void freeze()} disabled={busyOut || !ready || !canFreeze}>
                <Icon name="image" />
              </button>
              <button type="button" className="icon-button" aria-label="Delete" title="Delete the selected item" disabled={(!selLayer && !(selClip && clips.length > 1)) || busyOut} onClick={removeSelected}>
                <Icon name="trash" />
              </button>
            </div>

            <div inert={busyOut}>
            <Timeline
              project={project}
              time={time}
              selection={sel}
              zoom={zoom}
              onZoom={setZoom}
              snapping={snapping}
              onSnapping={setSnapping}
              strips={strips}
              onSeek={seek}
              onSelect={(x) => {
                setSel(x);
                setJoint(null);
              }}
              onTransition={setJoint}
              fileOf={files.fileOf}
              onChange={change}
              onScrubStart={() => {
                if (transportRef.current?.playing) void togglePlay();
              }}
            />
            </div>

            {status && !exporting && (
              <p role="status" className="note">
                {status}
              </p>
            )}
            {error && (
              <p className="error-line" role="alert">
                {error}
              </p>
            )}
          </div>

          <aside className="editor-side" aria-label="Controls" inert={busyOut}>
            {textLayer ? (
              <Inspector
                layer={textLayer}
                frame={frame}
                onText={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })}
                onStyle={(patch) => commit({ layers: patchLayer(layers, textLayer.id, { style: updateStyle([textLayer], textLayer.id, patch)[0]!.style }) })}
                onPreset={(id) => commit({ layers: patchLayer(layers, textLayer.id, { style: applyPreset(textLayer.style, id) }) })}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
                onFront={() => orderSelected('front')}
                onInsertWord={(w) => commit({ layers: patchLayer(layers, textLayer.id, { text: textLayer.text + (textLayer.text && !/\s$/.test(textLayer.text) ? ' ' : '') + w }) })}
                extra={
                  <>
                    <div className="insp-actions">
                      <button type="button" className="text-button is-primary" disabled={busy} onClick={() => void translate([textLayer.id])}>
                        Translate to Interslavic
                      </button>
                      {textLayer.original !== undefined && textLayer.original !== textLayer.text && (
                        <button type="button" className="text-button" onClick={() => commit({ layers: patchLayer(layers, textLayer.id, { text: textLayer.original! }) })}>
                          Restore original
                        </button>
                      )}
                    </div>
                    <TimeFields layer={textLayer} length={length} time={time} onPatch={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })} />
                    <KeyframePanel
                      layer={nowOf(textLayer)}
                      tLocal={time - (textLayer.start ?? 0)}
                      tracks={textLayer.tracks ?? []}
                      anims={textLayer.anims}
                      props={['x', 'y', 'rotation']}
                      onChange={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })}
                      onSeekLocal={(t) => seek((textLayer.start ?? 0) + t)}
                    />
                  </>
                }
              />
            ) : mediaLayer ? (
              <>
                <MediaInspector
                  layer={nowOf(mediaLayer)}
                  source={sourceOf(project, mediaLayer.srcId)}
                  frame={frame}
                  onChange={(patch) => commitMerge(`i:${mediaLayer.id}:${Object.keys(patch).join()}`, { layers: patchKeyed(layers, mediaLayer.id, patch) })}
                  onOrder={orderSelected}
                  onDuplicate={duplicateSelected}
                  onDelete={removeSelected}
                />
                {selSourceKind === 'video' && (
                  <SpeedAudioPanel
                    speed={mediaLayer.speed ?? 1}
                    volume={mediaLayer.volume ?? 1}
                    fadeIn={mediaLayer.fadeIn ?? 0}
                    fadeOut={mediaLayer.fadeOut ?? 0}
                    duration={mediaLayer.end - mediaLayer.start}
                    onChange={(patch) => commitMerge(`s:${mediaLayer.id}:${Object.keys(patch).join()}`, { layers: patchLayer(layers, mediaLayer.id, withSpeed(mediaLayer, patch)) })}
                    onExtract={extractSound}
                  />
                )}
                <EffectsPanel
                  adjust={mediaLayer.adjust ?? {}}
                  mask={mediaLayer.mask}
                  chroma={mediaLayer.chroma}
                  onChange={(patch) => commitMerge(`e:${mediaLayer.id}`, { layers: patchLayer(layers, mediaLayer.id, patch) })}
                />
                <KeyframePanel
                  layer={nowOf(mediaLayer)}
                  tLocal={time - mediaLayer.start}
                  tracks={mediaLayer.tracks ?? []}
                  anims={mediaLayer.anims}
                  props={['x', 'y', 'w', 'h', 'rotation', 'opacity']}
                  onChange={(patch) => commit({ layers: patchLayer(layers, mediaLayer.id, patch) })}
                  onSeekLocal={(t) => seek(mediaLayer.start + t)}
                />
              </>
            ) : audioLayer ? (
              <AudioPanel
                layer={audioLayer}
                name={sourceOf(project, audioLayer.srcId)?.name ?? 'Sound'}
                length={length}
                time={time}
                onPatch={(patch) => commitMerge(`a:${audioLayer.id}:${Object.keys(patch).join()}`, { layers: patchLayer(layers, audioLayer.id, withSpeed(audioLayer, patch)) })}
                onDelete={removeSelected}
              />
            ) : jointIndex > 0 ? (
              <section className="inspector" aria-label="Transition">
                <h3 className="insp-title">Transition</h3>
                <p className="note">Between clip {jointIndex} and clip {jointIndex + 1}.</p>
                <TransitionPicker
                  value={clips[jointIndex]!.transitionIn}
                  max={maxDuration(clips, jointIndex)}
                  onChange={(t) => commit({ clips: clips.map((c, k) => (k === jointIndex ? { ...c, transitionIn: t } : c)) })}
                />
                <div className="insp-actions">
                  <button type="button" className="text-button" onClick={() => setJoint(null)}>
                    Done
                  </button>
                </div>
              </section>
            ) : selClip ? (
              <>
                <ClipPanel
                  index={clipIndex}
                  clip={selClip}
                  duration={sourceOf(project, selClip.srcId)?.duration ?? Math.max(selClip.end, 3600)}
                  name={sourceOf(project, selClip.srcId)?.name ?? 'Video'}
                  playheadSource={locate(clips, time)?.index === clipIndex ? locate(clips, time)!.source : null}
                  onTrim={(patch) => commit({ clips: trim(clips, clipIndex, patch, sourceOf(project, selClip.srcId)?.duration ?? Math.max(selClip.end, 3600)) })}
                />
                {selSourceKind !== 'image' && (
                  <SpeedAudioPanel
                    speed={speedOf(selClip)}
                    volume={selClip.volume ?? 1}
                    fadeIn={selClip.fadeIn ?? 0}
                    fadeOut={selClip.fadeOut ?? 0}
                    duration={clipLength(selClip)}
                    onChange={(patch) => commitMerge(`c:${selClip.id}:${Object.keys(patch).join()}`, { clips: clips.map((c) => (c.id === selClip.id ? { ...c, ...patch } : c)) })}
                    onExtract={selSourceKind === 'video' ? extractSound : undefined}
                  />
                )}
                {clipIndex > 0 && (
                  <section className="inspector" aria-label="Transition">
                    <button type="button" className="text-button" onClick={() => setJoint(selClip.id)}>
                      Transition from the clip before…
                    </button>
                  </section>
                )}
              </>
            ) : (
              <section className="inspector is-idle" aria-label="Video settings">
                <p className="note">Click something in the video or on the timeline to change it. Drag the ends of a bar on the timeline to set how long it shows.</p>
                <label className="insp-row">
                  <span>Text language</span>
                  <select value={lang} onChange={(e) => setLang(e.target.value as SourceLang)} aria-label="Language of the text">
                    {LANGS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="insp-row">
                  <span>Interslavic script</span>
                  <select value={script} onChange={(e) => setScript(e.target.value as Script)} aria-label="Interslavic script">
                    <option value="standard">Latin</option>
                    <option value="cyrillic">Cyrillic</option>
                  </select>
                </label>
                <p className="insp-title">Sound</p>
                <button type="button" className={`switch${muted ? ' is-on' : ''}`} role="switch" aria-checked={muted} onClick={() => setMuted((m) => !m)}>
                  <Icon name={muted ? 'volumeOff' : 'volumeOn'} />
                  <span>{muted ? 'Sound is off' : 'Sound is on'}</span>
                </button>
                <label className="insp-row">
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={muted} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value) / 100)} />
                </label>
                {canSpeak() && voice && (
                  <>
                    <button type="button" className={`switch${voiceOver ? ' is-on' : ''}`} role="switch" aria-checked={voiceOver} onClick={() => setVoiceOver((v) => !v)}>
                      <Icon name="mic" />
                      <span>{voiceOver ? 'Reading the text aloud' : 'Read the text aloud'}</span>
                    </button>
                    {voiceOver && <VoicePicker />}
                    <p className="note">
                      Each text is spoken as it appears, and the sound is turned down while it is. You hear this when you play here; it is not part of the saved video, because a browser cannot record its own voices.
                    </p>
                  </>
                )}
                {textLayers.length > 0 && (
                  <>
                    <p className="insp-title">Texts</p>
                    <ol className="text-list" aria-label="Texts in the video">
                      {[...textLayers]
                        .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
                        .map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSel({ kind: 'layer', id: l.id });
                                seek(l.start ?? 0);
                              }}
                            >
                              <time>{clock(l.start ?? 0)}</time>
                              <span>{l.text || '(empty)'}</span>
                            </button>
                          </li>
                        ))}
                    </ol>
                  </>
                )}
                <p className="note">Other Slavic languages: choose Edit and type them.</p>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

/** When a text or sound is shown, as numbers: the same thing the timeline does by dragging. */
function TimeFields(props: { layer: Layer; length: number; time: number; onPatch: (patch: { start?: number; end?: number }) => void }) {
  const { layer, length, time } = props;
  const start = layer.start ?? 0;
  const end = layer.end ?? length;
  return (
    <div className="insp-times">
      <label>
        <span>Shown from (s)</span>
        <input type="number" aria-label="Shown from (seconds)" min={0} max={length} step={0.1} value={Number(start.toFixed(2))} onChange={(e) => props.onPatch({ start: Math.min(Math.max(0, Number(e.target.value)), end - 0.1) })} />
      </label>
      <button type="button" className="icon-button" aria-label="Start at playhead" title="Start at the playhead" onClick={() => props.onPatch({ start: Math.min(time, end - 0.1) })}>
        <Icon name="check" size="0.9rem" />
      </button>
      <label>
        <span>Until (s)</span>
        <input type="number" aria-label="Shown until (seconds)" min={0} max={length} step={0.1} value={Number(end.toFixed(2))} onChange={(e) => props.onPatch({ end: Math.min(length, Math.max(Number(e.target.value), start + 0.1)) })} />
      </label>
      <button type="button" className="icon-button" aria-label="End at playhead" title="End at the playhead" onClick={() => props.onPatch({ end: Math.max(time, start + 0.1) })}>
        <Icon name="check" size="0.9rem" />
      </button>
    </div>
  );
}

/** A sound laid on the edit: its volume and where it plays. */
function AudioPanel(props: { layer: AudioLayer; name: string; length: number; time: number; onPatch: (patch: Partial<AudioLayer>) => void; onDelete: () => void }) {
  const { layer } = props;
  return (
    <section className="inspector" aria-label="Sound settings">
      <h3 className="insp-title">{props.name}</h3>
      <SpeedAudioPanel
        speed={layer.speed ?? 1}
        volume={layer.volume ?? 1}
        fadeIn={layer.fadeIn ?? 0}
        fadeOut={layer.fadeOut ?? 0}
        duration={layer.end - layer.start}
        onChange={(patch) => props.onPatch(patch)}
      />
      <TimeFields layer={layer} length={props.length} time={props.time} onPatch={props.onPatch} />
      <div className="insp-actions">
        <button type="button" className="text-button" onClick={props.onDelete}>
          <Icon name="trash" /> Remove sound
        </button>
      </div>
    </section>
  );
}

/** Trimming the selected clip: where in the original video it starts and ends. */
function ClipPanel(props: {
  index: number;
  clip: Clip;
  duration: number;
  name: string;
  /** Where the playhead is in the original video, when it is inside this clip. */
  playheadSource: number | null;
  onTrim: (patch: { start?: number; end?: number }) => void;
}) {
  const { clip } = props;
  return (
    <section className="inspector" aria-label="Clip settings">
      <h2 className="insp-title">Clip {props.index + 1}: {props.name}</h2>
      <p className="note">Trimming changes only what plays; you can always trim back out.</p>
      <label className="insp-row">
        <span>Starts at</span>
        <input type="number" aria-label="Clip starts at (seconds)" min={0} max={props.duration} step={0.1} value={Number(clip.start.toFixed(2))} onChange={(e) => props.onTrim({ start: Number(e.target.value) })} />
      </label>
      <label className="insp-row">
        <span>Ends at</span>
        <input type="number" aria-label="Clip ends at (seconds)" min={0} max={props.duration} step={0.1} value={Number(clip.end.toFixed(2))} onChange={(e) => props.onTrim({ end: Number(e.target.value) })} />
      </label>
      <div className="insp-actions">
        <button type="button" className="text-button" disabled={props.playheadSource === null} onClick={() => props.onTrim({ start: props.playheadSource! })}>
          Start at playhead
        </button>
        <button type="button" className="text-button" disabled={props.playheadSource === null} onClick={() => props.onTrim({ end: props.playheadSource! })}>
          End at playhead
        </button>
      </div>
      <p className="note">Length {clock(clip.end - clip.start)} (at least {MIN_CLIP}s).</p>
    </section>
  );
}
