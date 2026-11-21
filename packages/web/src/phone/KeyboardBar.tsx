import type { ReactNode } from 'react';
import { useKeyboardInset } from './useKeyboardInset.ts';
import './keyboard-bar.css';

/**
 * A small toolbar that rides on top of the on-screen keyboard (text editing:
 * bold, size, colour, Done). Shown only while the keyboard is up, or always
 * with `forceShow` (tests, desktop preview). Mount one per screen.
 */
export function KeyboardBar({ children, forceShow = false, label = 'Text tools' }: { children: ReactNode; forceShow?: boolean; label?: string }) {
  const inset = useKeyboardInset();
  if (inset === 0 && !forceShow) return null;
  return (
    <div className="ph-kbar" role="toolbar" aria-label={label} style={{ bottom: inset }}>
      {children}
    </div>
  );
}
