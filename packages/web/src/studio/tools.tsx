import type { ReactElement } from 'react';
import PhotoEditor from '../photo/PhotoEditor.tsx';
import Player from '../player/Player.tsx';
import Subtitles from '../subtitles/Subtitles.tsx';
import Transcribe from '../transcribe/Transcribe.tsx';
import VideoEditor from '../video/VideoEditor.tsx';
import Worksheets from '../worksheets/Worksheets.tsx';

/**
 * The Studio's tools. One list drives the left rail, the home grid, the page
 * titles (meta.ts) and the routes, so a tool cannot be in one and missing
 * from another.
 */

export type Group = 'Edit' | 'Text & audio' | 'Learn & teach';
/** Where the work happens: on the user's device, or by asking the translator service. */
export type Runs = 'device' | 'service';

export interface Tool {
  slug: string;
  label: string;
  group: Group;
  /** One short plain sentence: what the tool does. */
  summary: string;
  runs: Runs;
  /** An SVG path in a 24x24 box, drawn as a line icon. */
  icon: string;
  element: () => ReactElement;
}

export const TOOLS: Tool[] = [
  {
    slug: 'photo',
    label: 'Photo',
    group: 'Edit',
    summary: 'Change the text in a photo, into Interslavic or any language you type, and move it around.',
    runs: 'device',
    icon: 'M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
    element: () => <PhotoEditor />,
  },
  {
    slug: 'video',
    label: 'Video',
    group: 'Edit',
    summary: 'Cut and arrange a video, add styled text or subtitles, translate them, and save it.',
    runs: 'device',
    icon: 'M3 6h13v12H3zM16 10l5-3v10l-5-3M7 10h5M7 14h3',
    element: () => <VideoEditor />,
  },
  {
    slug: 'recording',
    label: 'Recording',
    group: 'Text & audio',
    summary: 'Turn the speech in a recording into subtitles. Nothing leaves your device.',
    runs: 'device',
    icon: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4',
    element: () => <Transcribe />,
  },
  {
    slug: 'subtitles',
    label: 'Subtitles',
    group: 'Text & audio',
    summary: 'Upload a subtitle file (.srt) and get it back in Interslavic.',
    runs: 'service',
    icon: 'M3 5h18v14H3zM7 12h4M13 12h4M7 15h7',
    element: () => <Subtitles />,
  },
  {
    slug: 'watch',
    label: 'Watch',
    group: 'Learn & teach',
    summary: 'Play a video with Interslavic subtitles. Tap words, replay lines, save sentences.',
    runs: 'service',
    icon: 'M3 5h18v14H3zM10 9l5 3-5 3z',
    element: () => <Player />,
  },
  {
    slug: 'worksheets',
    label: 'Worksheets',
    group: 'Learn & teach',
    summary: 'Make a printable worksheet with an answer key.',
    runs: 'device',
    icon: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
    element: () => <Worksheets />,
  },
];

export const GROUPS: Group[] = ['Edit', 'Text & audio', 'Learn & teach'];
export const toolPath = (t: Tool): string => `/studio/${t.slug}`;
export const toolAt = (path: string): Tool | undefined =>
  TOOLS.find((t) => path.replace(/\/$/, '') === toolPath(t));
