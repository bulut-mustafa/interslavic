import { useEffect, useState } from 'react';
import { track } from '../analytics.ts';
import { chooseVoice, loadVoices, referenceVoices, saveVoice, savedVoice, speak, stop, supported } from './voices.ts';

/** The installed voices and the one in use; shared by every Listen button and the picker. */
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadVoices().then((v) => live && setVoices(v));
    const sync = () => setUri(savedVoice());
    sync();
    window.addEventListener('voicechange', sync);
    return () => {
      live = false;
      window.removeEventListener('voicechange', sync);
    };
  }, []);
  return { voices, voice: chooseVoice(voices, uri) };
}

/**
 * "Listen": reads the text with the chosen reference voice. Renders nothing
 * where the browser has no speech or no Czech, Polish, Croatian ... voice,
 * rather than a button that cannot work.
 */
export function Listen({ text, label = 'Listen', where }: { text: string; label?: string; where: string }) {
  const { voice } = useVoices();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => stop(), []);
  if (!supported() || !voice) return null;
  return (
    <button
      type="button"
      className="text-button"
      disabled={!text.trim()}
      aria-pressed={speaking}
      onClick={() => {
        if (speaking) {
          stop();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        speak(text, voice, () => setSpeaking(false));
        track('listen', { where, voice: voice.lang });
      }}
    >
      {speaking ? 'Stop' : label}
    </button>
  );
}

/** Which language's voice reads Interslavic, with the honest caveat. */
export function VoicePicker() {
  const { voices, voice } = useVoices();
  if (!supported() || !voice) return null;
  const groups = referenceVoices(voices);
  return (
    <div className="voice-picker">
      <label>
        <span>Voice</span>{' '}
        <select value={voice.voiceURI} onChange={(e) => saveVoice(e.target.value)} aria-describedby="voice-note">
          {groups.map((g) => (
            <optgroup key={g.code} label={g.label}>
              {g.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <span id="voice-note" className="voice-note">
        Interslavic has no voice of its own: this reads the text with the sound rules of another
        Slavic language, so it is an approximation.
      </span>
    </div>
  );
}
