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
import { createLiveClock } from './live-clock.ts';
import { perfBump } from './perf.ts';
import './editor.css';
import './mobile-video.css';
import { MIN_CLIP, length as clipLength, locate, removeClip, speedOf, splitAt, startOf, total, trim, type Clip } from './timeline.ts';


/** The longest side of the working frame: bigger videos are shown, and exported, at this size. */
export const MAX_SIDE = 1280;

export const LANGS: { value: SourceLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

/** Where a new text starts: the playhead, unless that leaves under a second of the edit (then the last second). */
export const textStartFor = (time: number, length: number): number => (length - time < 1 ? Math.max(0, length - 1) : time);

export const clock = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const readText = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });

/** Changes one layer of any kind. */
export const patchLayer = (layers: Layer[], id: string, patch: object): Layer[] => layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));

/** The picture size of the finished video: the chosen frame, else the first video's own size, scaled down to MAX_SIDE. */
export function frameOf(p: Project): { w: number; h: number } {
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
export function mediaLayerOf(src: Source, frame: { w: number; h: number }, start: number, lane: number): MediaLayer {
  const sw = src.w || frame.w * 0.4;
  const sh = src.h || frame.h * 0.4;
  const k = Math.min((frame.w * 0.5) / sw, (frame.h * 0.5) / sh);
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const len = src.kind === 'image' ? 5 : Math.max(0.5, src.duration ?? 5);
  return { id: newId('m'), kind: 'media', srcId: src.id, in: 0, start, end: start + len, track: lane, x: Math.round((frame.w - w) / 2), y: Math.round((frame.h - h) / 2), w, h, rotation: 0, opacity: 1, blend: 'normal' };
}

export const EMPTY_FEED = { picture: () => null };

/**
 * The editor's whole state and every action on it, with no screen in it: the
 * desktop page (VideoEditor.tsx) and the phone editor (phone/video) are two
 * faces over this one hook, so the project, history, transport, saving,
 * exporting and captions behave the same on both.
 */
export function useVideoEditor({ store = defaultVideoStore, makeTranscriber, decodeAudio, phone = false }: Deps & { store?: VideoStore | null; phone?: boolean } = {}) {
  perfBump('render');
  /** The playhead for things that must follow it every frame without rendering (the phone timeline). */
  const [liveClock] = useState(createLiveClock);
  /** React hears the playing time this often (ms); the desktop timeline is drawn by React, the phone's is not. */
  const tickMs = phone ? 250 : 80;
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
  /** The kept copy was cleared because the phone's edit was emptied. */
  const emptied = useRef(false);
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
      gentle: phone,
      hooks: {
        onFrame: () => {
          perfBump('frame');
          const at = t.time;
          liveClock.set(at);
          scene.current?.redraw();
          const now = performance.now();
          if (t.playing && voiceOverOn.current) reader.update(at, projectRef.current.layers.filter(isText), editLength(projectRef.current, total(projectRef.current.clips)));
          if (now - lastTick.current > tickMs || !t.playing) {
            lastTick.current = now;
            perfBump('tick');
            setTime(at);
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

  // Whatever moved the playhead while paused (a fresh video, an undo), the live clock follows it.
  useEffect(() => {
    if (!playing) liveClock.set(time);
  }, [time, playing, liveClock]);

  // The playhead never sits past the end of an edit that got shorter.
  useEffect(() => {
    if (time > length + 0.01) seek(length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  // The edit is kept as it changes, a moment after the last change.
  useEffect(() => {
    if (!store) return;
    if (!ready) {
      // Everything was deleted (phone): what is kept goes too, or a reload would bring the deleted video back. Undo in this visit still can.
      if (H.canUndo(hist) && !restoring) {
        emptied.current = true;
        keep(() => store.clear());
      }
      return;
    }
    if (emptied.current) {
      // Undo brought the video back after its files were cleared away: keep them again.
      emptied.current = false;
      for (const s of project.sources) {
        const f = files.fileOf(s.id);
        if (f) keep(() => store.saveSource(s.id, f));
      }
    }
    const t = setTimeout(() => {
      keep(() => store.saveRecord({ version: 2, hist, lang, script, muted, volume, voiceOver }));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, lang, script, muted, volume, voiceOver, ready, restoring]);

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
    liveClock.set(clamped);
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

  /** The selected thing removed. On the desktop the last clip of the main track stays; on the phone it can go (empty state, undo-able). */
  const removeSelected = () => {
    let cutAt: number | null = null;
    if (selLayer) commit({ layers: layers.filter((l) => l.id !== selLayer.id) });
    else if (selClip && clips.length > 1) {
      // The clips after it slide back to close the gap (the main track has none). A playhead that was inside it goes to where it was.
      const from = startOf(clips, clipIndex);
      if (time >= from - 0.001 && time <= from + clipLength(selClip) + 0.001) cutAt = from;
      commit({ clips: removeClip(clips, clipIndex) });
    } else if (selClip && phone) {
      // The phone lets the last video go: the editor falls back to its empty "Add a video" screen, and Undo brings everything back.
      grabbed.current.clear();
      commit({ clips: [] });
      setPlaying(false);
      setTime(0);
      liveClock.set(0);
    } else if (selClip) {
      setStatus('The last clip of the main track stays. Add another video first, or trim this one.');
      return;
    } else return;
    setSel(null);
    if (cutAt !== null) seek(Math.min(cutAt, total(removeClip(clips, clipIndex))));
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
    // At the very end of the edit there is no room after the playhead: a text there would last no time and could never be seen (or typed on). It goes to the last second instead, and the playhead goes with it.
    const start = textStartFor(time, length);
    const l = newLayer({
      x: frame.w * 0.1,
      y: frame.h * 0.4,
      maxWidth: frame.w * 0.8,
      start,
      end: Math.min(length, start + 3),
      style: defaultTextStyle(frame.h),
      track: topTrack(project) + 1,
    });
    commit({ layers: [...layers, l] });
    setSel({ kind: 'layer', id: l.id });
    if (start !== time) seek(start);
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

  const translate = async (ids: string[], from?: SourceLang) => {
    const targets = textLayers.filter((l) => ids.includes(l.id) && l.text.trim() !== '');
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    setStatus('Translating…');
    try {
      const out = await translateTexts(targets.map((l) => l.text), { lang: from ?? lang, script });
      let next = projectRef.current.layers;
      targets.forEach((l, i) => (next = patchLayer(next, l.id, { text: out[i]!.text, original: l.original ?? l.text })));
      commit({ layers: next });
      const doubtful = out.filter((r) => r.flagged).length;
      setStatus(`Translated ${targets.length} ${targets.length === 1 ? 'text' : 'texts'} into Interslavic.${doubtful ? ` ${doubtful} may be wrong - read ${doubtful === 1 ? 'it' : 'them'} before you save.` : ''}`);
      track('video-translate', { lang: from ?? lang, script, texts: targets.length });
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

  return {
    hist,
    setHist,
    sel,
    setSel,
    time,
    setTime,
    playing,
    setPlaying,
    muted,
    setMuted,
    volume,
    setVolume,
    voiceOver,
    setVoiceOver,
    voice,
    voiceRef,
    volumeRef,
    mutedRef,
    ducked,
    transportRef,
    applyVolume,
    voiceOverOn,
    lang,
    setLang,
    script,
    setScript,
    status,
    setStatus,
    error,
    setError,
    busy,
    setBusy,
    exporting,
    setExporting,
    typing,
    setTyping,
    strips,
    setStrips,
    zoom,
    setZoom,
    snapping,
    setSnapping,
    view,
    setView,
    askCaptions,
    setAskCaptions,
    capModel,
    setCapModel,
    captioning,
    setCaptioning,
    restoring,
    setRestoring,
    restoreFailed,
    setRestoreFailed,
    kept,
    setKept,
    transport,
    setTransport,
    joint,
    setJoint,
    lib,
    active,
    incoming,
    setIncoming,
    scene,
    wrap,
    abort,
    dragBase,
    lastTick,
    capAbort,
    writes,
    grabbed,
    stripCtl,
    touched,
    lastCommit,
    project,
    sources,
    clips,
    layers,
    projectRef,
    ready,
    commit,
    commitMerge,
    length,
    frame,
    selClip,
    clipIndex,
    selLayer,
    textLayer,
    mediaLayer,
    audioLayer,
    textLayers,
    jointIndex,
    nowOf,
    keyed,
    patchKeyed,
    shownText,
    onFrame,
    keep,
    seek,
    togglePlay,
    change,
    startFresh,
    addFiles,
    requestOpen,
    split,
    removeSelected,
    withSpeed,
    duplicateSelected,
    orderSelected,
    clearAll,
    first,
    firstVideoSrc,
    nothingToClear,
    freeze,
    extractSound,
    selSourceKind,
    atPlayhead,
    canFreeze,
    addText,
    importSubtitles,
    translate,
    makeCaptions,
    save,
    busyOut,
    liveClock,
    onKeys,
    keysRef,
    files,
    reader,
  };
}

export type VideoEditorState = ReturnType<typeof useVideoEditor>;
