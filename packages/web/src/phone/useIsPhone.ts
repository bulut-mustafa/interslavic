import { useSyncExternalStore } from 'react';

/** The phone layout is chosen by width only (docs/mobile-design.md): 40rem and narrower. */
export const PHONE_QUERY = '(max-width: 40rem)';

const hasMatchMedia = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Whether the screen is phone-width right now. False where there is no window (prerender) or no matchMedia. */
export function isPhoneNow(): boolean {
  return hasMatchMedia() && window.matchMedia(PHONE_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  if (mq.addEventListener) {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }
  mq.addListener?.(onChange); // old Safari
  return () => mq.removeListener?.(onChange);
}

/**
 * True on a phone-width screen, and follows resizes and rotation. On the server
 * (the prerender) the server snapshot is `false`, so the prerendered HTML is the
 * desktop page and React never sees a hydration mismatch.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhoneNow, () => false);
}
