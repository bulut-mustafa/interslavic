import type { ReactNode } from 'react';
import { Link } from '../router.tsx';

export interface TabItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Whether this tab is current for a path; default: the path equals href or sits under it. */
  match?: (path: string) => boolean;
}

const defaultMatch = (href: string, path: string): boolean => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/**
 * Bottom navigation: icon over label, 56px + the safe-area inset, links through
 * the app's router (`Link`), so moving between tabs does not reload.
 */
export function TabBar({ items, path, label = 'Site' }: { items: TabItem[]; path: string; label?: string }) {
  return (
    <nav className="ph-tabbar" aria-label={label}>
      {items.map((t) => {
        const on = (t.match ?? ((p: string) => defaultMatch(t.href, p)))(path);
        return (
          <Link key={t.href} href={t.href} className={`ph-tab${on ? ' is-current' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="ph-tab-icon">{t.icon}</span>
            <span className="ph-tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
