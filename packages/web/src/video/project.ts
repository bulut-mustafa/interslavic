import type * as H from '../editor/history.ts';
import type { TextLayer } from '../editor/layers.ts';
import { newId } from '../editor/layers.ts';
import type { Chroma, Mask } from './effects.ts';
import type { Track } from './keyframes.ts';
import type { Anims } from './text-anim.ts';
import type { Clip } from './timeline.ts';

/**
 * The video editor's whole edit as one plain value, so it can be undone, saved
 * and handed to the player and the exporter alike.
 *
 *  - `sources` are the files the edit draws on (videos, pictures, sounds). The
 *    files themselves are kept apart; an edit refers to them by id.
 *  - `clips` is the MAIN track: video clips one after another with no gaps, so
 *    the edit's length is the sum of the clips.
 *  - `layers` sit on top of the main track, each on a numbered lane with its
 *    own place and length on the edit's clock. Higher lanes are in front.
 *
 * All times are seconds. Edit time is the finished video's clock; source time
 * is a position inside one source file.
 */

export type SourceKind = 'video' | 'image' | 'audio';

export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  /** Seconds. Videos and sounds; known once the file has been read. */
  duration?: number;
  /** Pixels. Videos and pictures. */
  w?: number;
  h?: number;
}

/** Picture adjustments, each 0 when untouched (brightness, contrast, saturation: -100..100; hue: degrees; blur: pixels). */
export interface Adjust {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
  /** -100..100 */
  temperature?: number;
  tint?: number;
  /** 0..100 */
  fade?: number;
  sharpen?: number;
  vignette?: number;
}

export type Blend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

/** Things every layer that shows a picture or plays a sound can do. */
interface Timed {
  id: string;
  /** Where the layer sits on the edit's clock. */
  start: number;
  end: number;
  /** Lane; higher is in front (pictures) and lower in the list (sounds). */
  track: number;
  /** 0 to 1; 1 when missing. */
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Values that change over the layer's time, and how it comes in and goes out. */
  tracks?: Track[];
  anims?: Anims;
}

/** A video or picture placed over the main track. Position and size are in frame pixels. */
export interface MediaLayer extends Timed {
  kind: 'media';
  srcId: string;
  /** Where in the source the layer starts playing (videos). */
  in: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the centre. */
  rotation: number;
  opacity: number;
  blend: Blend;
  speed?: number;
  adjust?: Adjust;
  /** Shows only part of the picture, with a soft or hard edge. */
  mask?: Mask;
  /** Makes one colour see-through (green screen). */
  chroma?: Chroma;
}

/** A sound (music, a voice-over) on its own lane. */
export interface AudioLayer extends Timed {
  kind: 'audio';
  srcId: string;
  in: number;
  speed?: number;
}

export type Layer = TextLayer | MediaLayer | AudioLayer;

export const isMedia = (l: Layer): l is MediaLayer => (l as MediaLayer).kind === 'media';
export const isAudio = (l: Layer): l is AudioLayer => (l as AudioLayer).kind === 'audio';
export const isText = (l: Layer): l is TextLayer => !isMedia(l) && !isAudio(l);

/** The lane a layer is on. */
export const trackOf = (l: Layer): number => (isText(l) ? (l.track ?? 0) : l.track);

export interface VideoProject {
  sources: Source[];
  /** The main track. */
  clips: Clip[];
  layers: Layer[];
  /** The picture size of the finished video; null follows the first video on the main track. */
  frame: { w: number; h: number } | null;
  /** What shows where the main track does not fill the frame. */
  background: string;
}

export const emptyProject = (): VideoProject => ({ sources: [], clips: [], layers: [], frame: null, background: '#000000' });

export const newSourceId = (): string => newId('s');

/** The shape saved by the editor when it could hold one video only. */
export interface ProjectV1 {
  clips: Clip[];
  layers: TextLayer[];
}

export const SOURCE_V1 = 's0';

/** An old single-video edit as a project: the one video becomes source `s0`. */
export function fromV1(old: ProjectV1, name: string): VideoProject {
  return {
    sources: [{ id: SOURCE_V1, kind: 'video', name }],
    clips: old.clips.map((c) => (c.srcId ? c : { ...c, srcId: SOURCE_V1 })),
    layers: old.layers,
    frame: null,
    background: '#000000',
  };
}

/** Every step of an old edit's history, converted the same way, so undo still works after the upgrade. */
export function historyFromV1(old: H.History<ProjectV1>, name: string): H.History<VideoProject> {
  return {
    past: old.past.map((p) => fromV1(p, name)),
    present: fromV1(old.present, name),
    future: old.future.map((p) => fromV1(p, name)),
  };
}

export const sourceOf = (p: VideoProject, id: string | undefined): Source | undefined => (id ? p.sources.find((s) => s.id === id) : undefined);

/** The edit's length on its own clock: the main track, or later if a layer runs past it. */
export function editLength(p: VideoProject, mainTotal: number): number {
  return p.layers.reduce((n, l) => Math.max(n, l.end ?? 0), mainTotal);
}
