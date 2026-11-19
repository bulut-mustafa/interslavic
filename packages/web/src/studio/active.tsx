import { createContext, useContext } from 'react';

/**
 * Tools stay mounted when the user moves to another tool, so their work is
 * still there on return. This says whether the tool using it is the one on
 * screen, so a hidden tool can stop what should not carry on unseen (playing a
 * video) and pick up what arrived while it was away (a transcript sent to it).
 */
export const ActiveContext = createContext(true);

export const useToolActive = (): boolean => useContext(ActiveContext);
