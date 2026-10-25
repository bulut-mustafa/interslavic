import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * The few routes the site has - the translator, the lessons, the phrasebook -
 * need no router library: the address is the state, `pushState` changes it, and
 * `popstate` brings the back button along. Deep links work because the server
 * answers every unknown path with the page itself.
 */

const CHANGE = 'locationchange';

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(CHANGE));
  window.scrollTo?.(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
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
