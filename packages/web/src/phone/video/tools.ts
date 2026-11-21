import { isAudio, isMedia, isText, sourceOf, type Layer, type VideoProject } from '../../video/project.ts';
import type { Selection } from '../../video/contracts.ts';
import { hasKeyAt, removeKey, setKey, type AnimProp, type Track } from '../../video/keyframes.ts';

/**
 * Which tools the bottom strip offers, by what is selected. Pure data, so the
 * "strip changes with the selection" rule is tested without a screen.
 *
 * An item is either a SHEET (it opens the one bottom sheet) or an ACTION (it
 * does its thing at once: split, delete, duplicate, translate, edit).
 */

export type StripMode = 'project' | 'clip' | 'text' | 'media' | 'audio';

export type ToolId =
  // project (nothing selected)
  | 'edit' | 'audio' | 'text' | 'overlay' | 'effects' | 'transitions' | 'ratio' | 'captions' | 'voice'
  // clip, text, media and audio layers
  | 'split' | 'speed' | 'volume' | 'animate' | 'style' | 'opacity' | 'type' | 'translate' | 'duplicate' | 'delete';

export interface ToolDef {
  id: ToolId;
  label: string;
  disabled?: boolean;
}

export const ACTIONS: ReadonlySet<ToolId> = new Set<ToolId>(['split', 'delete', 'duplicate', 'translate', 'type']);

export const isAction = (id: ToolId): boolean => ACTIONS.has(id);

/** What the selection is. */
export function modeOf(p: VideoProject, sel: Selection): StripMode {
  if (!sel) return 'project';
  if (sel.kind === 'clip') return p.clips.some((c) => c.id === sel.id) ? 'clip' : 'project';
  const l = p.layers.find((x) => x.id === sel.id);
  if (!l) return 'project';
  return isText(l) ? 'text' : isAudio(l) ? 'audio' : 'media';
}

/** The selected thing's source kind (a still has no speed or sound). */
const kindOfSel = (p: VideoProject, sel: Selection): 'video' | 'image' | 'audio' | undefined => {
  if (!sel) return undefined;
  if (sel.kind === 'clip') return sourceOf(p, p.clips.find((c) => c.id === sel.id)?.srcId)?.kind;
  const l = p.layers.find((x) => x.id === sel.id);
  return l && !isText(l) ? sourceOf(p, l.srcId)?.kind : undefined;
};

export function toolsFor(p: VideoProject, sel: Selection, opts: { canDeleteClip?: boolean; hasText?: boolean } = {}): { mode: StripMode; items: ToolDef[] } {
  const mode = modeOf(p, sel);
  const kind = kindOfSel(p, sel);
  const still = kind === 'image';
  switch (mode) {
    case 'project':
      return {
        mode,
        items: [
          { id: 'edit', label: 'Edit' },
          { id: 'audio', label: 'Audio' },
          { id: 'text', label: 'Text' },
          { id: 'overlay', label: 'Overlay' },
          { id: 'effects', label: 'Effects' },
          { id: 'transitions', label: 'Transitions', disabled: p.clips.length < 2 },
          { id: 'ratio', label: 'Ratio' },
          { id: 'captions', label: 'Captions' },
          { id: 'voice', label: 'Voice' },
        ],
      };
    case 'clip':
      return {
        mode,
        items: [
          { id: 'split', label: 'Split' },
          { id: 'speed', label: 'Speed', disabled: still },
          { id: 'volume', label: 'Volume', disabled: still },
          { id: 'animate', label: 'Animate' },
          { id: 'effects', label: 'Effects' },
          { id: 'delete', label: 'Delete', disabled: opts.canDeleteClip === false },
        ],
      };
    case 'text':
      return {
        mode,
        items: [
          { id: 'type', label: 'Edit' },
          { id: 'style', label: 'Style' },
          { id: 'animate', label: 'Animate' },
          { id: 'translate', label: 'Translate' },
          { id: 'duplicate', label: 'Duplicate' },
          { id: 'delete', label: 'Delete' },
        ],
      };
    case 'media':
      return {
        mode,
        items: [
          { id: 'effects', label: 'Effects' },
          { id: 'animate', label: 'Animate' },
          { id: 'opacity', label: 'Opacity' },
          { id: 'speed', label: 'Speed', disabled: still },
          { id: 'volume', label: 'Volume', disabled: still },
          { id: 'duplicate', label: 'Duplicate' },
          { id: 'delete', label: 'Delete' },
        ],
      };
    case 'audio':
      return {
        mode,
        items: [
          { id: 'volume', label: 'Volume' },
          { id: 'speed', label: 'Speed' },
          { id: 'duplicate', label: 'Duplicate' },
          { id: 'delete', label: 'Delete' },
        ],
      };
  }
}

// ---------- the keyframe diamond ----------

/** The properties the diamond keys for each kind of layer (the same lists the desktop panel shows). */
export const KEY_PROPS: Record<'media' | 'text', AnimProp[]> = {
  media: ['x', 'y', 'w', 'h', 'rotation', 'opacity'],
  text: ['x', 'y', 'rotation'],
};

const valueOfProp = (l: Layer, prop: AnimProp): number => {
  const v = (l as unknown as Record<string, unknown>)[prop];
  return typeof v === 'number' ? v : prop === 'opacity' ? 1 : 0;
};

/** Whether the layer has a key (of any property the diamond handles) at `tLocal`. */
export function diamondOn(l: Layer, tLocal: number): boolean {
  if (isAudio(l)) return false;
  const props = KEY_PROPS[isMedia(l) ? 'media' : 'text'];
  return props.some((p) => hasKeyAt(l.tracks ?? [], p, tLocal));
}

/**
 * The tracks after the diamond is pressed at `tLocal`: with keys there, they
 * go; without, every property gets a key holding its value NOW. `now` is the
 * layer as it is at the playhead (keyframes resolved), `layer` is the stored one.
 */
export function toggleDiamond(layer: Layer, now: Layer, tLocal: number): Track[] {
  const props = KEY_PROPS[isMedia(layer) ? 'media' : 'text'];
  let tracks = [...(layer.tracks ?? [])];
  if (diamondOn(layer, tLocal)) {
    for (const p of props) tracks = removeKey(tracks, p, tLocal);
    return tracks;
  }
  for (const p of props) tracks = setKey(tracks, p, tLocal, valueOfProp(now, p));
  return tracks;
}

// ---------- the project's picture size ----------

export interface RatioChoice {
  id: string;
  label: string;
  /** Width over height; null follows the first video. */
  ratio: number | null;
}

export const RATIOS: RatioChoice[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
];

/** The frame for a ratio, its longer side `maxSide` (even numbers; encoders want them). */
export function frameForRatio(ratio: number, maxSide = 1280): { w: number; h: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return ratio >= 1 ? { w: even(maxSide), h: even(maxSide / ratio) } : { w: even(maxSide * ratio), h: even(maxSide) };
}

/** The label of a frame's ratio: a known one when it matches, else "w:h" as numbers. */
export function ratioLabel(frame: { w: number; h: number } | null): string {
  if (!frame) return 'Original';
  const r = frame.w / frame.h;
  const known = RATIOS.find((x) => x.ratio !== null && Math.abs(x.ratio - r) < 0.01);
  return known?.label ?? `${frame.w}:${frame.h}`;
}
