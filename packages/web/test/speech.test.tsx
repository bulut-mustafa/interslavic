// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';
import { chooseVoice, referenceVoices } from '../src/speech/voices.ts';

const voice = (name: string, lang: string): SpeechSynthesisVoice =>
  ({ name, lang, voiceURI: `uri:${name}`, localService: true, default: false }) as SpeechSynthesisVoice;

const VOICES = [voice('Alex', 'en-US'), voice('Milena', 'ru-RU'), voice('Zuzana', 'cs-CZ'), voice('Zosia', 'pl-PL'), voice('Lana', 'hr-HR')];

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const spoken: FakeUtterance[] = [];
let cancels = 0;

function installSpeech(voices: SpeechSynthesisVoice[]) {
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak: (u: FakeUtterance) => void spoken.push(u),
      cancel: () => void cancels++,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}

beforeEach(() => {
  spoken.length = 0;
  cancels = 0;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/phrasebook');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // @ts-expect-error - remove the fake between tests
  delete window.speechSynthesis;
});

describe('reference voices', () => {
  it('offers only voices of the Latin-script Slavic reference languages', () => {
    const groups = referenceVoices(VOICES);
    expect(groups.map((g) => g.label)).toEqual(['Czech', 'Polish', 'Croatian']);
    expect(groups.flatMap((g) => g.voices.map((v) => v.name))).not.toContain('Milena'); // Cyrillic: not offered
    expect(groups.flatMap((g) => g.voices.map((v) => v.name))).not.toContain('Alex');
  });

  it('keeps a saved voice that is still installed, else falls back to the first offered', () => {
    expect(chooseVoice(VOICES, 'uri:Zosia')!.name).toBe('Zosia');
    expect(chooseVoice(VOICES, 'uri:Gone')!.name).toBe('Zuzana');
    expect(chooseVoice([voice('Alex', 'en-US')], null)).toBeNull();
  });
});

describe('Listen', () => {
  it('reads a phrase with the chosen voice, exactly as written', async () => {
    installSpeech(VOICES);
    render(<App />);
    await act(async () => {});
    const [first] = screen.getAllByRole('button', { name: 'Listen' });
    fireEvent.click(first!);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe('Dobry denj!');
    expect(spoken[0]!.voice!.name).toBe('Zuzana');
    expect(spoken[0]!.lang).toBe('cs-CZ');
    expect(cancels).toBeGreaterThan(0); // a new request replaces any being read
  });

  it('uses the voice picked in the picker next time, and remembers it', async () => {
    installSpeech(VOICES);
    render(<App />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Voice'), { target: { value: 'uri:Lana' } });
    expect(window.localStorage.getItem('interslavic-voice-v1')).toBe('uri:Lana');
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: 'Listen' })[0]!);
    expect(spoken.at(-1)!.voice!.name).toBe('Lana');
  });

  it('says in plain words that the voice is an approximation', async () => {
    installSpeech(VOICES);
    render(<App />);
    await act(async () => {});
    expect(screen.getByText(/it is an approximation/)).toBeTruthy();
  });

  it('shows no button where the browser has no usable voice', async () => {
    installSpeech([voice('Alex', 'en-US'), voice('Milena', 'ru-RU')]);
    render(<App />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(screen.queryByLabelText('Voice')).toBeNull();
  });

  it('shows no button where the browser has no speech at all', async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
  });
});
