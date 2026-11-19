// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PerfOverlay, wantsPerf } from '../src/studio/PerfOverlay.tsx';
import { screen } from './live-screen.ts';

afterEach(() => cleanup());

describe('the developer readout', () => {
  it('is wanted only by ?perf=1', () => {
    expect(wantsPerf('?perf=1')).toBe(true);
    expect(wantsPerf('?x=2&perf=1')).toBe(true);
    expect(wantsPerf('')).toBe(false);
    expect(wantsPerf('?perf=0')).toBe(false);
  });

  it('shows the canvases and pages that are open, and says n/a where the browser gives no heap figure', () => {
    document.body.insertAdjacentHTML('beforeend', '<canvas class="layer-canvas" width="2400" height="1800"></canvas><button class="page-tile"></button><button class="page-tile"></button>');
    render(<PerfOverlay />);
    const text = screen.getByLabelText('Performance readout').textContent!;
    expect(text).toContain('canvases 1 (16 MB)');
    expect(text).toContain('pages 2');
    expect(text).toContain('JS heap n/a'); // jsdom has no performance.memory
    document.querySelectorAll('.layer-canvas, .page-tile').forEach((e) => e.remove());
  });
});
