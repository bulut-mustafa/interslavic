/**
 * Reading Interslavic aloud with a voice the browser already has.
 *
 * There is no Interslavic voice, and no sourced rule here for respelling
 * Interslavic into another language's spelling, so the text goes to the voice
 * as written. That only makes sense for a voice whose language is written in
 * Latin letters and is close to Interslavic - Czech, Polish, Croatian and the
 * like - which is why only those are offered. What comes out is an
 * approximation of Interslavic, and the page says so.
 */

/** Languages offered as the reference: Latin-script Slavic languages the dictionary compares with. */
export const REFERENCE_LANGS: { code: string; label: string }[] = [
  { code: 'cs', label: 'Czech' },
  { code: 'pl', label: 'Polish' },
  { code: 'hr', label: 'Croatian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'bs', label: 'Bosnian' },
];

const KEY = 'interslavic-voice-v1';

export const supported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const base = (lang: string): string => lang.toLowerCase().split(/[-_]/)[0]!;

/** The installed voices of the reference languages, grouped by language and in the browser's order. */
export function referenceVoices(all: SpeechSynthesisVoice[]): { code: string; label: string; voices: SpeechSynthesisVoice[] }[] {
  return REFERENCE_LANGS.map((l) => ({ ...l, voices: all.filter((v) => base(v.lang) === l.code) })).filter((l) => l.voices.length > 0);
}

/** Voices load after the page does in some browsers, so wait for them once. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!supported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

export function savedVoice(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveVoice(uri: string): void {
  try {
    window.localStorage.setItem(KEY, uri);
    window.dispatchEvent(new Event('voicechange'));
  } catch {
    // Not remembered on this device.
  }
}

/** The voice to use: the saved one if it is still installed, else the first reference voice. */
export function chooseVoice(all: SpeechSynthesisVoice[], savedUri: string | null): SpeechSynthesisVoice | null {
  const offered = referenceVoices(all).flatMap((l) => l.voices);
  return offered.find((v) => v.voiceURI === savedUri) ?? offered[0] ?? null;
}

export function speak(text: string, voice: SpeechSynthesisVoice, onEnd?: () => void): void {
  const synth = window.speechSynthesis;
  synth.cancel(); // a new request replaces whatever is being read
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stop(): void {
  if (supported()) window.speechSynthesis.cancel();
}
