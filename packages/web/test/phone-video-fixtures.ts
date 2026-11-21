import type { TextLayer } from '../src/editor/layers.ts';
import { DEFAULT_STYLE } from '../src/editor/text-style.ts';
import type { AudioLayer, MediaLayer, VideoProject } from '../src/video/project.ts';
import { emptyProject } from '../src/video/project.ts';

/** A project of videos of the given lengths (seconds), one 60 s source each, and the given layers. */
export function videoProject(o: { clips: number[]; layers?: VideoProject['layers'] }): VideoProject {
  const p = emptyProject();
  p.sources = [
    { id: 's1', kind: 'video', name: 'talk.mp4', duration: 60, w: 1920, h: 1080 },
    { id: 's2', kind: 'image', name: 'logo.png', w: 800, h: 600 },
    { id: 's3', kind: 'audio', name: 'tune.mp3', duration: 30 },
  ];
  p.clips = o.clips.map((len, i) => ({ id: `c${i}`, srcId: 's1', start: 0, end: len }));
  p.layers = o.layers ?? [];
  return p;
}

export const textLayer = (id: string, start: number, end: number, track: number): TextLayer => ({ id, text: id, x: 10, y: 10, maxWidth: 200, style: { ...DEFAULT_STYLE }, start, end, track });
export const mediaLayer = (id: string, start: number, end: number, track: number): MediaLayer => ({ id, kind: 'media', srcId: 's2', in: 0, start, end, track, x: 100, y: 100, w: 200, h: 150, rotation: 0, opacity: 1, blend: 'normal' });
export const soundLayer = (id: string, start: number, end: number, track: number): AudioLayer => ({ id, kind: 'audio', srcId: 's3', in: 0, start, end, track });
