// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Timeline } from '../src/video/Timeline.tsx';
import { emptyProject } from '../src/video/project.ts';
import type { TimelineProps } from '../src/video/contracts.ts';

// How the new Timeline's own behaviour is tested (items, edges, drags, zoom) is in video-timeline-ui.test.tsx.
// This file keeps the scrubbing behaviour of the playhead, measured on the whole edit.

beforeEach(() => {
  // one animation frame is a timer tick here, so a drag's per-frame seeks can be stepped through
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Two clips of 10 s and 30 s: a 40 s edit, as after a split. At 20 px a second the lanes are 800 px wide. */
function setup() {
  const onSeek = vi.fn();
  const onScrubStart = vi.fn();
  const props: TimelineProps = {
    project: {
      ...emptyProject(),
      sources: [{ id: 'v', kind: 'video', name: 'talk.mp4', duration: 60 }],
      clips: [{ id: 'a', srcId: 'v', start: 0, end: 10 }, { id: 'b', srcId: 'v', start: 10, end: 40 }],
    },
    time: 0,
    selection: null,
    zoom: 20,
    onZoom: vi.fn(),
    snapping: true,
    onSnapping: vi.fn(),
    strips: [],
    onSeek,
    onSelect: vi.fn(),
    onChange: vi.fn(),
    onScrubStart,
  };
  const view = render(<Timeline {...props} />);
  const lane = view.container.querySelector('.timeline-lanes') as HTMLElement;
  lane.getBoundingClientRect = () => ({ left: 100, width: 800, top: 0, height: 200, right: 900, bottom: 200, x: 100, y: 0, toJSON: () => {} });
  const fire = (type: string, x: number, target: Element = lane) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true, button: 0 }));
  return { onSeek, onScrubStart, lane, fire, view };
}

describe('scrubbing the timeline', () => {
  it('puts the playhead where it is pressed, whichever clip is under the pointer', async () => {
    const { onSeek, fire, view } = setup();
    const second = view.container.querySelector('[data-item="clip:b"] button') as HTMLElement;
    await act(async () => fire('pointerdown', 400, second));
    expect(onSeek).not.toHaveBeenCalledWith(15); // a press on a clip picks the clip; it does not scrub
    await act(async () => fire('pointerdown', 400));
    expect(onSeek).toHaveBeenLastCalledWith(15); // 300 px in at 20 px a second
  });

  it('follows the pointer while it is held and dragged, and finishes where it is let go', async () => {
    const { onSeek, onScrubStart, fire } = setup();
    await act(async () => fire('pointerdown', 100));
    expect(onScrubStart).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenLastCalledWith(0);
    for (const x of [200, 300, 500, 700]) {
      await act(async () => {
        fire('pointermove', x);
        await new Promise((r) => setTimeout(r, 5)); // a frame passes
      });
    }
    expect(onSeek.mock.calls.map((c) => c[0])).toEqual([0, 5, 10, 20, 30]);
    await act(async () => fire('pointerup', 900));
    expect(onSeek).toHaveBeenLastCalledWith(40); // let go past the end: the end
  });

  it('asks the video for one new frame per screen frame, not one per pointer event', async () => {
    const { onSeek, fire } = setup();
    await act(async () => fire('pointerdown', 100));
    onSeek.mockClear();
    await act(async () => {
      for (let x = 101; x < 160; x++) fire('pointermove', x); // 59 events inside one frame
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith((159 - 100) / 20); // the latest position
  });

  it('does not move the playhead when the pointer moves without being held', async () => {
    const { onSeek, fire } = setup();
    await act(async () => {
      fire('pointermove', 400);
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('stops following once the pointer is let go', async () => {
    const { onSeek, fire } = setup();
    await act(async () => fire('pointerdown', 100));
    await act(async () => fire('pointerup', 200));
    onSeek.mockClear();
    await act(async () => {
      fire('pointermove', 600);
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
