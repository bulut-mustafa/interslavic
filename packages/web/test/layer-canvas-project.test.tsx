// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { LayerCanvas } from '../src/editor/LayerCanvas.tsx';
import { emptyProject, type MediaLayer } from '../src/video/project.ts';

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}), set: () => true });
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
});
afterEach(cleanup);

const m = (over: Partial<MediaLayer>): MediaLayer => ({ id: 'm', kind: 'media', srcId: 's', in: 0, start: 0, end: 5, track: 1, x: 100, y: 100, w: 200, h: 100, rotation: 0, opacity: 1, blend: 'normal', ...over });

describe('LayerCanvas in project mode', () => {
  it('selects a media layer by clicking it, the front one where they overlap, and nothing on empty space', () => {
    const onSelect = vi.fn();
    const project = { ...emptyProject(), layers: [m({ id: 'back' }), m({ id: 'front', track: 2 })] };
    const view = render(<LayerCanvas width={800} height={600} layers={[]} project={project} media={{ picture: () => null }} time={1} selectedId={null} onSelect={onSelect} onDrag={vi.fn()} onDragEnd={vi.fn()} />);
    const c = view.container.querySelector('canvas')!;
    const down = (x: number, y: number) => act(() => void c.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })));
    down(150, 120);
    expect(onSelect).toHaveBeenLastCalledWith('front');
    down(700, 500);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
