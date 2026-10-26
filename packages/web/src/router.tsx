import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * The few routes the site has - the translator, the lessons, the phrasebook -
 * need no router library: the address is the state, `pushState` changes it, and
 * `popstate` brings the back button along. Deep links work because every page
 * is prerendered to its own HTML file (scripts/prerender.ts).
 */

const CHANGE = 'locationchange';

/** The page being prerendered at build time, where there is no `window`. */
let serverPath = '/';
export function setServerPath(path: string): void {
  serverPath = path;
}
const currentPath = (): string => (typeof window === 'undefined' ? serverPath : window.location.pathname);

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(CHANGE));
  // A new page starts at its top at once; only in-page links glide (styles.css).
  window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    window.addEventListener('popstate', update);
    window.addEventListener(CHANGE, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(CHANGE, update);
    };
  }, []);
  return path;
}

/** A link that changes page without reloading it; a modified click still opens a tab. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={go} {...rest} />;
}
