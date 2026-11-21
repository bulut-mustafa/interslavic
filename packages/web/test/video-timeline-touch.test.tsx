// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Timeline } from '../src/video/Timeline.tsx';
import { emptyProject } from '../src/video/project.ts';

afterEach(cleanup);

function setup() {
  const onSeek = vi.fn();
  const view = render(
    <Timeline
      project={{ ...emptyProject(), sources: [{ id: 'v', kind: 'video', name: 'a.mp4', duration: 60 }], clips: [{ id: 'c1', srcId: 'v', start: 0, end: 10 }], layers: [] }}
      time={0}
      selection={null}
      zoom={100}
      onZoom={vi.fn()}
      snapping
      onSnapping={vi.fn()}
      strips={[]}
      onSeek={onSeek}
      onSelect={vi.fn()}
      onChange={vi.fn()}
      onScrubStart={vi.fn()}
    />,
  );
  const lanes = view.container.querySelector('.timeline-lanes') as HTMLElement;
  lanes.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 300, right: 2000, bottom: 300, x: 0, y: 0, toJSON: () => {} });
  const fire = (el: Element, type: string, x: number, y: number, pointerType: string) =>
    act(async () => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 });
      Object.defineProperty(e, 'pointerType', { value: pointerType });
      el.dispatchEvent(e);
    });
  return { onSeek, lanes, fire, view };
}

describe('the timeline under a finger', () => {
  it('a tap on an empty lane seeks on release; a pan that is cancelled does not move the playhead', async () => {
    const t = setup();
    await t.fire(t.lanes, 'pointerdown', 500, 200, 'touch');
    expect(t.onSeek).not.toHaveBeenCalled();
    await t.fire(t.lanes, 'pointercancel', 500, 200, 'touch');
    expect(t.onSeek).not.toHaveBeenCalled();
    await t.fire(t.lanes, 'pointerdown', 500, 200, 'touch');
    await t.fire(t.lanes, 'pointerup', 500, 200, 'touch');
    expect(t.onSeek).toHaveBeenCalledTimes(1);
    expect(t.onSeek.mock.calls[0]![0]).toBeCloseTo(5, 1);
  });

  it('the mouse still seeks at once on press', async () => {
    const t = setup();
    await t.fire(t.lanes, 'pointerdown', 300, 200, 'mouse');
    expect(t.onSeek).toHaveBeenCalled();
  });

  it('the ruler scrubs at once, also under a finger', async () => {
    const t = setup();
    const ruler = t.view.container.querySelector('.tl-ruler')!;
    await t.fire(ruler, 'pointerdown', 400, 10, 'touch');
    expect(t.onSeek).toHaveBeenCalled();
  });
});
