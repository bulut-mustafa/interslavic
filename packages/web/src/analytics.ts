/**
 * Anonymous usage counts through Umami (cookie-free, no personal data). Events
 * carry categories only - a language, a script, right or wrong - never what
 * someone typed or what we translated. If the script is blocked or has not
 * loaded, this does nothing.
 */
declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number | boolean>) => void };
  }
}

export function track(name: string, data?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  window.umami?.track(name, data);
}
