import type { Rect } from '../editor/text-style.ts';
import type { Layer, VideoProject } from './project.ts';

/**
 * The seams between the parts of the video editor, written down once so the
 * parts can be built apart and still fit. Nothing here does any work: it is
 * types only. A part implements the side it owns and uses the others through
 * these shapes.
 */

/** What is selected on the timeline and on the picture. */
export type Selection = { kind: 'clip'; id: string } | { kind: 'layer'; id: string } | null;

/** How an edit to the project reaches the history. A drag sends `preview` for every move and `end` once. */
export type ChangeMode = 'commit' | 'preview' | 'end';

export interface ProjectChange {
  clips?: VideoProject['clips'];
  layers?: VideoProject['layers'];
}

/** Little pictures along a video, for the timeline (see `frames.ts`). */
export interface FrameStrip {
  srcId: string;
  /** Source seconds each picture was taken at, with the picture (a data URL). */
  frames: { time: number; url: string }[];
}

/**
 * The timeline (part C). It draws the project and turns pointer and keyboard
 * input into changes; it holds no edit state of its own except the zoom and
 * scroll, which it reports so the editor can keep them.
 */
export interface TimelineProps {
  project: VideoProject;
  /** The playhead, edit seconds. */
  time: number;
  selection: Selection;
  /** Pixels per second. */
  zoom: number;
  onZoom(pxPerSecond: number): void;
  snapping: boolean;
  onSnapping(on: boolean): void;
  strips: FrameStrip[];
  onSeek(t: number): void;
  onSelect(s: Selection): void;
  onChange(change: ProjectChange, mode: ChangeMode): void;
  /** Called when a drag on the timeline begins, so playback can pause. */
  onScrubStart(): void;
}

/**
 * Where a source's current picture or sound comes from. The compositor draws
 * from this and never touches an element itself; the transport owns the
 * elements.
 */
export interface MediaFeed {
  /**
   * The thing to draw for one ITEM right now (a playing <video> or a loaded
   * image), or null while it is not ready. Items, not sources: the same file
   * can be a main clip and an overlay at once, each at its own moment, so each
   * item has its own element. The id is a main clip's `id` or a layer's `id`.
   */
  picture(itemId: string): CanvasImageSource | null;
}

/** What the compositor needs to draw one frame, and nothing more. */
export interface DrawRequest {
  project: VideoProject;
  /** Edit seconds. */
  time: number;
  /** The frame being drawn, in pixels. */
  size: { w: number; h: number };
  media: MediaFeed;
  /** Layers to outline as selected (preview only; export passes none). */
  selected?: readonly string[];
}

/** Draws a frame: main track first, then lanes from the lowest to the highest. Part B. */
export type DrawFrame = (ctx: CanvasRenderingContext2D, req: DrawRequest) => void;

/** The box of a layer in frame pixels, after rotation, for hit-testing and handles. Part B/D. */
export interface LayerBox {
  id: string;
  /** Centre. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export type BoxOf = (layer: Layer, measure?: unknown) => LayerBox | null;

export type { Rect };

/** What plays the project: a clock, the media elements and their sound. Part A. */
export interface TransportHooks {
  /** A new frame is ready to draw (called each animation frame while playing, and after a seek). */
  onFrame(): void;
  onEnded(): void;
}

export interface Transport extends MediaFeed {
  /** The playhead, edit seconds. */
  readonly time: number;
  readonly playing: boolean;
  seek(t: number): void;
  play(): Promise<void>;
  pause(): void;
  /** The project changed under a running preview. */
  resync(): void;
  /** Output volume of the preview, 0 to 1. */
  setMasterVolume(v: number): void;
  dispose(): void;
}

/** Where the files are: one object URL (or File) per source id. */
export interface SourceFiles {
  urlOf(srcId: string): string | null;
}

export interface TransportOptions {
  getProject(): VideoProject;
  files: SourceFiles;
  hooks: TransportHooks;
  /**
   * Export only: send all sound here instead of the speakers (a
   * MediaStreamAudioDestinationNode). With it, volumes and fades are applied
   * with gain nodes; without it, on the elements themselves.
   */
  sink?: { context: AudioContext; destination: AudioNode };
  /**
   * Phone preview: fewer live decoders, a wider drift allowance and at most one corrective seek a second per element, because on
   * a phone every seek stalls the decoder for longer than the drift it fixes. The desktop leaves it off.
   */
  gentle?: boolean;
}

/** Part A exports this from `transport.ts`. */
export type CreateTransport = (o: TransportOptions) => Transport;
