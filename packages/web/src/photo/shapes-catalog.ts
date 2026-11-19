import type { ImageLayer, ShapeKind } from './doc.ts';

/**
 * What the Add panel offers. Icons are single SVG path strings on a 24x24 grid
 * (stroke only, like components/Icon.tsx), drawn here, not taken from anyone.
 *
 * Stickers are emoji added as TEXT layers, so no image file is shipped or
 * licensed. The glyph is drawn by the viewer's operating system font (Apple
 * Color Emoji, Noto Color Emoji, Segoe UI Emoji ...): it looks different from
 * device to device, and an exported image uses the glyph of the device that
 * exports. This app bundles no emoji artwork.
 */

export interface ShapeEntry {
  kind: ShapeKind;
  label: string;
  path: string;
}

export const SHAPE_ENTRIES: readonly ShapeEntry[] = [
  { kind: 'rect', label: 'Rectangle', path: 'M4 6h16v12H4z' },
  { kind: 'ellipse', label: 'Ellipse', path: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z' },
  { kind: 'triangle', label: 'Triangle', path: 'M12 4l9 16H3z' },
  { kind: 'star', label: 'Star', path: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z' },
  { kind: 'heart', label: 'Heart', path: 'M12 20S4 14.8 4 9.4A4.4 4.4 0 0112 7a4.4 4.4 0 018 2.4C20 14.8 12 20 12 20z' },
  { kind: 'line', label: 'Line', path: 'M4 20L20 4' },
  { kind: 'arrow', label: 'Arrow', path: 'M4 20L20 4M10 4h10v10' },
];

export type FrameKind = NonNullable<ImageLayer['frame']>;

export interface FrameEntry {
  frame: FrameKind | undefined;
  label: string;
  path: string;
}

/** The shapes a picture can be shown in; `undefined` is the plain rectangle (no frame). */
export const FRAME_ENTRIES: readonly FrameEntry[] = [
  { frame: undefined, label: 'No frame', path: 'M4 6h16v12H4z' },
  { frame: 'rounded', label: 'Rounded', path: 'M8 5h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V8a3 3 0 013-3z' },
  { frame: 'ellipse', label: 'Ellipse', path: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z' },
  { frame: 'triangle', label: 'Triangle', path: 'M12 4l9 16H3z' },
  { frame: 'star', label: 'Star', path: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z' },
  { frame: 'heart', label: 'Heart', path: 'M12 20S4 14.8 4 9.4A4.4 4.4 0 0112 7a4.4 4.4 0 018 2.4C20 14.8 12 20 12 20z' },
];

export interface StickerGroup {
  id: string;
  label: string;
  chars: readonly string[];
}

export const STICKER_GROUPS: readonly StickerGroup[] = [
  { id: 'faces', label: 'Faces', chars: ['😀', '😂', '😍', '😎', '🥳', '🤔', '😭', '😡', '😴', '🙃', '😇', '🤩'] },
  { id: 'symbols', label: 'Symbols', chars: ['❤️', '⭐', '✨', '🔥', '💯', '✅', '❌', '❓', '❗', '💡', '🎯', '⚡'] },
  { id: 'nature', label: 'Nature', chars: ['🌞', '🌙', '☁️', '🌈', '🌸', '🌳', '🍀', '🌊', '🐶', '🐱', '🦋', '🐝'] },
  { id: 'things', label: 'Things', chars: ['🎉', '🎁', '🎈', '🏆', '📌', '📷', '🎵', '☕', '🍕', '🚀', '✈️', '🏠'] },
];

export const ALL_STICKERS: readonly string[] = STICKER_GROUPS.flatMap((g) => g.chars);

/** Icon paths for the buttons of the Position menu and the like, in the same grid. */
export const ALIGN_ICONS = {
  left: 'M4 4v16M8 7h12M8 14h7',
  center: 'M12 4v16M6 7h12M8 14h8',
  right: 'M20 4v16M4 7h12M9 14h7',
  top: 'M4 4h16M7 8v12M14 8v7',
  middle: 'M4 12h16M7 6v12M14 8v8',
  bottom: 'M4 20h16M7 4v12M14 9v7',
} as const;

export const FLIP_ICONS = {
  x: 'M12 3v18M8 7L3 17h5zM16 7l5 10h-5z',
  y: 'M3 12h18M7 8L17 3v5zM7 16l10 5v-5z',
} as const;
