import { useEffect, useState } from 'react';

/**
 * A small readout for whoever is working on the Studio: add ?perf=1 to the
 * address. It reads the browser's own numbers on this device and sends nothing
 * anywhere. The heap figure is Chrome's and leaves out canvas and decoded-image
 * memory, so the canvas count (each is about width x height x 4 bytes) is shown
 * beside it.
 */

interface Reading {
  heapMb: number | null;
  canvases: number;
  canvasMb: number;
  pages: number;
}

const read = (): Reading => {
  const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.layer-canvas')];
  return {
    heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    canvases: canvases.length,
    canvasMb: Math.round(canvases.reduce((n, c) => n + c.width * c.height * 4, 0) / 1048576),
    pages: document.querySelectorAll('.page-tile').length,
  };
};

export const wantsPerf = (search: string): boolean => new URLSearchParams(search).get('perf') === '1';

export function PerfOverlay() {
  const [r, setR] = useState<Reading>(read);
  useEffect(() => {
    const t = setInterval(() => setR(read()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <aside className="perf-overlay" aria-label="Performance readout">
      <strong>perf</strong>
      <span>JS heap {r.heapMb === null ? 'n/a' : `${r.heapMb} MB`}</span>
      <span>
        canvases {r.canvases} ({r.canvasMb} MB)
      </span>
      <span>pages {r.pages}</span>
    </aside>
  );
}
