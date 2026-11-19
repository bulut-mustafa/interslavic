// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { thumbnailOf } from '../src/photo/thumb.ts';

let widths: number[] = [];
beforeEach(() => {
  widths = [];
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => {} })) as never;
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
    widths.push(this.width);
    return 'data:image/jpeg;base64,AAAA';
  } as never;
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 4000; naturalHeight = 3000; set src(v: string) { if (v) queueMicrotask(() => this.onload?.()); } });
});
afterEach(() => vi.unstubAllGlobals());

describe('thumbnailOf', () => {
  it('makes a small JPEG, scaled so its long side is the size asked for', async () => {
    expect(await thumbnailOf(new File(['x'], 'a.png'), 240)).toBe('data:image/jpeg;base64,AAAA');
    expect(widths).toEqual([240]); // 4000 wide scaled to 240
  });

  it('does one at a time, so several large photos are never decoded together', async () => {
    let live = 0;
    let most = 0;
    vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 100; naturalHeight = 100; set src(v: string) { if (!v) return; live++; most = Math.max(most, live); setTimeout(() => { live--; this.onload?.(); }, 5); } });
    await Promise.all([1, 2, 3, 4].map(() => thumbnailOf(new File(['x'], 'a.png'))));
    expect(most).toBe(1);
  });

  it('gives undefined for a file that is not a picture, and goes on to the next', async () => {
    vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(v: string) { if (v) queueMicrotask(() => this.onerror?.()); } });
    expect(await thumbnailOf(new File(['x'], 'a.txt'))).toBeUndefined();
  });
});
