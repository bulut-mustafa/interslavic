/**
 * Passing a finished transcript to the Subtitles page: in this tab's session
 * storage only, taken once, and never sent anywhere.
 */
const KEY = 'interslavic-handoff-srt';

export interface Handoff {
  srt: string;
  lang: 'en' | 'ru' | 'uk';
  name: string;
}

export function putHandoff(h: Handoff): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // The user can still download the file and open it on the Subtitles page.
  }
}

export function takeHandoff(): Handoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as Handoff) : null;
  } catch {
    return null;
  }
}
