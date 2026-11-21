import { useEffect } from 'react';
import { installViewportLock } from './viewportLock.ts';

export { focusNoScroll } from './viewportLock.ts';

/** Keeps the locked phone shell on screen with the keyboard open (see viewportLock.ts). SSR-safe: effects only. */
export function useViewportLock(): void {
  useEffect(() => installViewportLock(), []);
}
