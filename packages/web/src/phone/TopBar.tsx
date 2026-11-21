import type { ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../router.tsx';

export interface TopBarProps {
  title: ReactNode;
  /** Shows a back arrow that navigates here (a link, so it works with the router). */
  backHref?: string;
  /** Or a back arrow that calls this. `backHref` wins when both are given. */
  onBack?: () => void;
  backLabel?: string;
  /** Right-hand actions: icon buttons, one primary action. */
  right?: ReactNode;
}

/** The slim 48px bar at the top of a phone screen: optional back arrow, title, actions. */
export function TopBar({ title, backHref, onBack, backLabel = 'Back', right }: TopBarProps) {
  return (
    <header className="ph-topbar">
      {backHref ? (
        <Link href={backHref} className="ph-bar-btn" aria-label={backLabel}>
          <Icon name="arrowLeft" size="1.4rem" />
        </Link>
      ) : onBack ? (
        <button type="button" className="ph-bar-btn" aria-label={backLabel} onClick={onBack}>
          <Icon name="arrowLeft" size="1.4rem" />
        </button>
      ) : null}
      <p className="ph-topbar-title">{title}</p>
      <div className="ph-topbar-right">{right}</div>
    </header>
  );
}
