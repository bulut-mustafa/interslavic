import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IconName } from '../components/Icon.tsx';

/** One action a screen adds to the phone's top-bar menu (the desktop shows it as a button on the page). */
export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  onSelect: () => void;
}

type Setter = (owner: string, items: MenuItem[] | null) => void;
const SetCtx = createContext<Setter | null>(null);
const ItemsCtx = createContext<MenuItem[]>([]);

/** Holds the items screens register; PhoneApp mounts one around the whole shell. */
export function PhoneMenuProvider({ children }: { children: ReactNode }) {
  const [owners, setOwners] = useState<Record<string, MenuItem[]>>({});
  const set = useMemo<Setter>(
    () => (owner, items) =>
      setOwners((o) => {
        if (items === null) {
          if (!(owner in o)) return o;
          const { [owner]: _gone, ...rest } = o;
          return rest;
        }
        return { ...o, [owner]: items };
      }),
    [],
  );
  const all = useMemo(() => Object.values(owners).flat(), [owners]);
  return (
    <SetCtx.Provider value={set}>
      <ItemsCtx.Provider value={all}>{children}</ItemsCtx.Provider>
    </SetCtx.Provider>
  );
}

/** The items screens added, in registration order. */
export const useMenuList = (): MenuItem[] => useContext(ItemsCtx);

/**
 * A screen adds actions to the top-bar menu while it is mounted. Pass a
 * memoised array (useMemo) so the menu is only rewritten when it changes.
 * Outside the phone shell (desktop, prerender) this does nothing.
 */
export function useMenuItems(owner: string, items: MenuItem[]): void {
  const set = useContext(SetCtx);
  useEffect(() => {
    if (!set) return;
    set(owner, items);
    return () => set(owner, null);
  }, [set, owner, items]);
}
