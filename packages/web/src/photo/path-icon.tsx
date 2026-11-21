/** A line icon from a path on the 24x24 grid, in the look of components/Icon.tsx (which only takes names from its own closed list). */
export function PathIcon({ d, size = '1.1rem' }: { d: string; size?: string }) {
  return (
    <svg className="icon" style={{ width: size, height: size }} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const EYE = 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z';
export const EYE_OFF = 'M3 3l18 18M10.6 6.1A9 9 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.5 7.6C3.8 9.4 2 12 2 12s4 7 10 7a9 9 0 004-1M9.9 9.9a2.5 2.5 0 003.2 3.2';
export const LOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3';
export const UNLOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 016.8-1.2';
export const GRIP = 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01';
export const TEXT_T = 'M5 6V4h14v2M12 4v16M9 20h6';
