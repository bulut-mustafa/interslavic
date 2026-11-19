/**
 * Sentences saved from videos, kept in this browser only - no account, nothing
 * sent anywhere. Storage can be missing or refuse (private windows), so every
 * access is guarded and the player works without it.
 */

const KEY = 'interslavic-notes-v1';

export interface Note {
  id: string;
  /** The Interslavic subtitle, as shown. */
  isv: string;
  /** The same moment in the original language, when the user loaded those subtitles. */
  original?: string;
  /** The video file's name and the time in it, so a note says where it came from. */
  video: string;
  at: number;
}

export function loadNotes(): Note[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

function save(notes: Note[]): Note[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Not remembered on this device; the notes shown still work for this visit.
  }
  return notes;
}

/** Adds a note unless the same sentence from the same moment of the same video is already saved. */
export function addNote(note: Omit<Note, 'id'>): Note[] {
  const notes = loadNotes();
  if (notes.some((n) => n.video === note.video && n.at === note.at && n.isv === note.isv)) return notes;
  return save([...notes, { ...note, id: `${Date.now().toString(36)}-${notes.length}` }]);
}

export const removeNote = (id: string): Note[] => save(loadNotes().filter((n) => n.id !== id));
export const clearNotes = (): Note[] => save([]);
