import { vi } from 'vitest';

/**
 * jsdom has no canvas. The photo editor tests stand a plain object in for the 2D context: every drawing method a test does not look at
 * is a spy that does nothing, `measureText` is ten pixels a letter, and `getImageData` is a flat light grey.
 */
const METHODS = [
  'drawImage', 'putImageData', 'clearRect', 'fillRect', 'strokeRect', 'save', 'restore', 'setLineDash', 'beginPath', 'roundRect', 'fill', 'fillText',
  'strokeText', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'clip', 'rect', 'arc', 'arcTo', 'ellipse', 'moveTo',
  'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'stroke',
] as const;

export function fakeContext(over: Record<string, unknown> = {}): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    measureText: (s: string) => ({ width: s.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(240) }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  for (const m of METHODS) ctx[m] = vi.fn();
  return Object.assign(ctx, over);
}
