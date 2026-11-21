import { useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { EffectsPanel } from '../../editor/EffectsPanel.tsx';
import { KeyframePanel } from '../../editor/KeyframePanel.tsx';
import { SpeedAudioPanel, type SpeedAudioPatch } from '../../editor/SpeedAudioPanel.tsx';
import { TextEffectsPanel } from '../../editor/TextEffectsPanel.tsx';
import { TransitionPicker } from '../../editor/TransitionPicker.tsx';
import { updateStyle } from '../../editor/layers.ts';
import { FONTS, PRESETS as STYLE_PRESETS, applyPreset, type FontKey, type TextStyle } from '../../editor/text-style.ts';
import { VoicePicker } from '../../speech/Listen.tsx';
import { supported as canSpeak } from '../../speech/voices.ts';
import { UploadsSheet } from '../../studio/UploadsSheet.tsx';
import { MODELS, type WhisperModel } from '../../transcribe/models.ts';
import { stageFraction, stageText } from '../../transcribe/run.ts';
import { Elapsed } from '../../transcribe/Elapsed.tsx';
import type { Script, SourceLang } from '../../subtitles/translate.ts';
import { sourceOf, type AudioLayer, type MediaLayer } from '../../video/project.ts';
import { PRESETS as ANIM_PRESETS, PRESET_LABELS, type AnimPreset, type Anims } from '../../video/text-anim.ts';
import { maxDuration } from '../../video/transitions.ts';
import { length as clipLength, locate, speedOf, trim } from '../../video/timeline.ts';
import { LANGS, clock, patchLayer, type VideoEditorState } from '../../video/useVideoEditor.ts';
import { PATHS, PIcon, Chips, PickButton, Row, Section, Slider, Switch } from './atoms.tsx';
import { RATIOS, frameForRatio, ratioLabel } from './tools.ts';
import type { Track } from '../../video/keyframes.ts';

type Ed = VideoEditorState;
const percent = (v: number): string => `${Math.round(v * 100)}%`;

// ---------- speed and volume (one panel, two sheets) ----------

/** The speed and sound props of whatever is selected: a main clip, a picture or video layer, or a sound. */
export function soundTarget(ed: Ed): (React.ComponentProps<typeof SpeedAudioPanel> & { name: string }) | null {
  const { selClip, mediaLayer, audioLayer, clips, layers, commitMerge, withSpeed, project, extractSound, selSourceKind } = ed;
  const keys = (p: object) => Object.keys(p).join();
  if (selClip) {
    return {
      name: sourceOf(project, selClip.srcId)?.name ?? 'Clip',
      speed: speedOf(selClip),
      volume: selClip.volume ?? 1,
      fadeIn: selClip.fadeIn ?? 0,
      fadeOut: selClip.fadeOut ?? 0,
      duration: clipLength(selClip),
      onChange: (patch: SpeedAudioPatch) => commitMerge(`c:${selClip.id}:${keys(patch)}`, { clips: clips.map((c) => (c.id === selClip.id ? { ...c, ...patch } : c)) }),
      onExtract: selSourceKind === 'video' ? extractSound : undefined,
    };
  }
  const layer: MediaLayer | AudioLayer | null = mediaLayer ?? audioLayer;
  if (layer) {
    return {
      name: sourceOf(project, layer.srcId)?.name ?? 'Layer',
      speed: layer.speed ?? 1,
      volume: layer.volume ?? 1,
      fadeIn: layer.fadeIn ?? 0,
      fadeOut: layer.fadeOut ?? 0,
      duration: layer.end - layer.start,
      onChange: (patch: SpeedAudioPatch) => commitMerge(`s:${layer.id}:${keys(patch)}`, { layers: patchLayer(layers, layer.id, withSpeed(layer, patch)) }),
      onExtract: mediaLayer && selSourceKind === 'video' ? extractSound : undefined,
    };
  }
  return null;
}

export function SoundSheet({ ed, parts }: { ed: Ed; parts: 'speed' | 'sound' }) {
  const t = soundTarget(ed);
  if (!t) return <p className="pv-hint">Pick a clip or a sound first.</p>;
  const { name: _name, ...props } = t;
  return <SpeedAudioPanel {...props} parts={parts} />;
}

// ---------- opacity, effects, fit ----------

export function OpacitySheet({ ed }: { ed: Ed }) {
  const { mediaLayer, selClip, textLayer, layers, clips, commitMerge, patchKeyed, nowOf } = ed;
  if (mediaLayer) {
    const now = nowOf(mediaLayer);
    return <Slider label="Opacity" value={now.opacity} min={0} max={1} step={0.01} show={percent} onChange={(opacity) => commitMerge(`i:${mediaLayer.id}:opacity`, { layers: patchKeyed(layers, mediaLayer.id, { opacity }) })} />;
  }
  if (selClip) return <Slider label="Opacity" value={selClip.opacity ?? 1} min={0} max={1} step={0.01} show={percent} onChange={(opacity) => commitMerge(`c:${selClip.id}:opacity`, { clips: clips.map((c) => (c.id === selClip.id ? { ...c, opacity } : c)) })} />;
  if (textLayer) return <Slider label="Opacity" value={textLayer.style.opacity} min={0.1} max={1} step={0.05} show={percent} onChange={(opacity) => commitMerge(`x:${textLayer.id}:opacity`, { layers: patchLayer(layers, textLayer.id, { style: updateStyle([textLayer], textLayer.id, { opacity })[0]!.style }) })} />;
  return null;
}

export function EffectsSheet({ ed, onPick }: { ed: Ed; onPick: (s: { kind: 'clip' | 'layer'; id: string }) => void }) {
  const { mediaLayer, selClip, layers, clips, project, commitMerge } = ed;
  if (mediaLayer) {
    return (
      <EffectsPanel adjust={mediaLayer.adjust ?? {}} mask={mediaLayer.mask} chroma={mediaLayer.chroma} onChange={(patch) => commitMerge(`e:${mediaLayer.id}`, { layers: patchLayer(layers, mediaLayer.id, patch) })} />
    );
  }
  if (selClip) {
    return (
      <>
        <Section title="Fit in the frame">
          <Chips
            label="Fit"
            value={selClip.fit ?? 'contain'}
            options={[
              { id: 'contain', label: 'Whole picture' },
              { id: 'cover', label: 'Fill the frame' },
            ]}
            onChange={(fit) => ed.commit({ clips: clips.map((c) => (c.id === selClip.id ? { ...c, fit } : c)) })}
          />
        </Section>
        <OpacitySheet ed={ed} />
        <p className="pv-hint">Colour adjustments, masks and green screen work on pictures and videos you add with Overlay.</p>
      </>
    );
  }
  // Nothing picked: choose what to adjust.
  const media = layers.filter((l): l is MediaLayer => (l as MediaLayer).kind === 'media');
  const here = locate(clips, ed.time);
  return (
    <Section title="What do you want to adjust?">
      {here && <Row label="The clip at the playhead" hint={sourceOf(project, clips[here.index]?.srcId)?.name} icon={<PIcon d={PATHS.fit} />} onClick={() => onPick({ kind: 'clip', id: clips[here.index]!.id })} />}
      {media.map((l) => (
        <Row key={l.id} label={sourceOf(project, l.srcId)?.name ?? 'Overlay'} hint={`Overlay from ${clock(l.start)}`} icon={<PIcon d={PATHS.overlay} />} onClick={() => onPick({ kind: 'layer', id: l.id })} />
      ))}
      {media.length === 0 && <p className="pv-hint">Add a picture or video with Overlay to give it colour, a mask or a green screen.</p>}
    </Section>
  );
}

// ---------- animate ----------

export function AnimateSheet({ ed }: { ed: Ed }) {
  const { mediaLayer, textLayer, layers, time, nowOf, seek, commit } = ed;
  const layer = mediaLayer ?? textLayer;
  if (!layer) return <p className="pv-hint">Keyframes and in/out animations work on text, pictures and overlay videos. To animate a main clip, add it as an Overlay.</p>;
  const start = layer.start ?? 0;
  return (
    <KeyframePanel
      layer={nowOf(layer)}
      tLocal={time - start}
      tracks={layer.tracks ?? []}
      anims={layer.anims}
      props={mediaLayer ? ['x', 'y', 'w', 'h', 'rotation', 'opacity'] : ['x', 'y', 'rotation']}
      onChange={(patch) => commit({ layers: patchLayer(layers, layer.id, patch as { tracks?: Track[]; anims?: Anims }) })}
      onSeekLocal={(t) => seek(start + t)}
    />
  );
}

// ---------- text: Font / Style / Effects / Animation ----------

type TextTab = 'font' | 'style' | 'effects' | 'animation';

export function TextStyleSheet({ ed }: { ed: Ed }) {
  const { textLayer, layers, commitMerge, commit, frame } = ed;
  const [tab, setTab] = useState<TextTab>('font');
  if (!textLayer) return null;
  const s = textLayer.style;
  const id = textLayer.id;
  const style = (patch: Partial<TextStyle>) => commitMerge(`x:${id}:${Object.keys(patch).join()}`, { layers: patchLayer(layers, id, { style: updateStyle([textLayer], id, patch)[0]!.style }) });
  const maxSize = Math.max(60, Math.round(frame.h / 2));
  return (
    <>
      <div className="pv-tabs" role="tablist" aria-label="Text options">
        {(
          [
            ['font', 'Font'],
            ['style', 'Style'],
            ['effects', 'Effects'],
            ['animation', 'Animation'],
          ] as [TextTab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pv-tab${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'font' && (
        <>
          <Chips
            label="Font"
            value={s.font}
            options={(Object.keys(FONTS) as FontKey[]).map((k) => ({ id: k, label: <span style={{ fontFamily: FONTS[k].css }}>{FONTS[k].label}</span>, aria: FONTS[k].label }))}
            onChange={(font) => style({ font })}
          />
          <Slider label="Size" value={Math.round(s.size)} min={8} max={maxSize} step={1} onChange={(size) => style({ size })} />
          <div className="pv-toggles" role="group" aria-label="Emphasis and alignment">
            <button type="button" className={`pv-toggle${s.bold ? ' is-on' : ''}`} aria-pressed={s.bold} aria-label="Bold" onClick={() => style({ bold: !s.bold })}>
              <Icon name="bold" size="1.3rem" />
            </button>
            <button type="button" className={`pv-toggle${s.italic ? ' is-on' : ''}`} aria-pressed={s.italic} aria-label="Italic" onClick={() => style({ italic: !s.italic })}>
              <Icon name="italic" size="1.3rem" />
            </button>
            <button type="button" className={`pv-toggle${s.uppercase ? ' is-on' : ''}`} aria-pressed={s.uppercase} aria-label="Capitals" onClick={() => style({ uppercase: !s.uppercase })}>
              Aa
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" className={`pv-toggle${s.align === a ? ' is-on' : ''}`} aria-pressed={s.align === a} aria-label={`Align ${a}`} onClick={() => style({ align: a })}>
                <Icon name={a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight'} size="1.3rem" />
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'style' && (
        <>
          <div className="pv-presets" role="group" aria-label="Styles">
            {STYLE_PRESETS.map((p) => (
              <button key={p.id} type="button" className="pv-chip" onClick={() => commit({ layers: patchLayer(layers, id, { style: applyPreset(s, p.id) }) })}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="pv-slider">
            <span className="pv-slider-top">
              <span>Colour</span>
            </span>
            <input type="color" className="pv-color" aria-label="Text colour" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ffffff'} onChange={(e) => style({ color: e.target.value })} />
          </label>
          <Slider label="Opacity" value={s.opacity} min={0.1} max={1} step={0.05} show={percent} onChange={(opacity) => style({ opacity })} />
          <Slider label="Letter spacing" value={s.letterSpacing} min={-2} max={20} step={0.5} onChange={(letterSpacing) => style({ letterSpacing })} />
          <Slider label="Line height" value={s.lineHeight} min={0.8} max={2.2} step={0.05} onChange={(lineHeight) => style({ lineHeight })} />
        </>
      )}
      {tab === 'effects' && <TextEffectsPanel style={s} onChange={(patch) => style(patch)} />}
      {tab === 'animation' && <AnimRows anims={textLayer.anims} onChange={(anims) => commit({ layers: patchLayer(layers, id, { anims }) })} />}
    </>
  );
}

const SLOTS = [
  { id: 'in', label: 'In', def: 0.5 },
  { id: 'out', label: 'Out', def: 0.5 },
  { id: 'loop', label: 'Loop', def: 1 },
] as const;

/** In, Out and Loop animations: a row of presets each, and how long (a loop: one cycle). */
function AnimRows({ anims, onChange }: { anims: Anims | undefined; onChange: (a: Anims) => void }) {
  const set = (slot: 'in' | 'out' | 'loop', next: { preset: AnimPreset; dur: number } | undefined) => {
    const a: Anims = { ...(anims ?? {}) };
    if (next && next.preset !== 'none') a[slot] = next;
    else delete a[slot];
    onChange(a);
  };
  return (
    <>
      {SLOTS.map((s) => {
        const cur = anims?.[s.id];
        return (
          <Section key={s.id} title={s.label}>
            <Chips label={`${s.label} animation`} value={cur?.preset ?? 'none'} options={ANIM_PRESETS.map((p) => ({ id: p, label: PRESET_LABELS[p] }))} onChange={(preset) => set(s.id, { preset, dur: cur?.dur ?? s.def })} />
            {cur && <Slider label={`${s.label} duration`} value={cur.dur} min={0.1} max={5} step={0.1} show={(v) => `${v.toFixed(1)} s`} onChange={(dur) => set(s.id, { preset: cur.preset, dur })} />}
          </Section>
        );
      })}
    </>
  );
}

// ---------- project tools ----------

export function EditSheet({ ed, close }: { ed: Ed; close: () => void }) {
  const { clips, time, commit, split, freeze, clearAll, nothingToClear, canFreeze, project } = ed;
  const here = locate(clips, time);
  const clip = here ? clips[here.index] : undefined;
  const duration = clip ? (sourceOf(project, clip.srcId)?.duration ?? Math.max(clip.end, 3600)) : 0;
  const cut = (patch: { start?: number; end?: number }) => {
    if (!here) return;
    commit({ clips: trim(clips, here.index, patch, duration) });
    close();
  };
  return (
    <Section>
      <Row label="Split at the playhead" hint="Cuts the clip in two here" icon={<Icon name="split" size="1.5rem" />} onClick={() => { split(); close(); }} />
      <Row label="Trim the start to here" hint="Removes the part before the playhead" disabled={!here} icon={<PIcon d="M5 4v16M5 12h14M13 6l6 6-6 6" />} onClick={() => cut({ start: here!.source })} />
      <Row label="Trim the end to here" hint="Removes the part after the playhead" disabled={!here} icon={<PIcon d="M19 4v16M19 12H5M11 6l-6 6 6 6" />} onClick={() => cut({ end: here!.source })} />
      <Row label="Freeze frame" hint="Holds this picture for 3 seconds" disabled={!canFreeze} icon={<Icon name="image" size="1.5rem" />} onClick={() => { void freeze(); close(); }} />
      <Row label="Clear all edits" hint="Back to the first video, nothing laid over it (Undo brings it back)" disabled={nothingToClear} icon={<Icon name="trash" size="1.5rem" />} onClick={() => { clearAll(); close(); }} />
    </Section>
  );
}

export function AudioSheet({ ed }: { ed: Ed }) {
  const { muted, setMuted, volume, setVolume, addFiles, busyOut, selClip, extractSound, selSourceKind } = ed;
  return (
    <>
      <Section title="Add sound">
        <PickButton label="Add a sound from your phone" accept="audio/*,video/*" multiple disabled={busyOut} icon={<PIcon d={PATHS.audio} />} hint="Music or a recording, placed at the playhead" onFiles={(l) => void addFiles(l.filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name)), 'overlay')} />
        {selClip && selSourceKind === 'video' && <Row label="Extract the sound of the picked clip" icon={<Icon name="volumeOn" size="1.5rem" />} onClick={extractSound} />}
      </Section>
      <Section title="The whole video">
        <Switch label={muted ? 'Sound is off' : 'Sound is on'} on={!muted} onChange={(on) => setMuted(!on)} />
        <Slider label="Master volume" value={Math.round(volume * 100)} min={0} max={100} step={5} show={(v) => `${v}%`} disabled={muted} onChange={(v) => setVolume(v / 100)} />
      </Section>
    </>
  );
}

export function OverlaySheet({ ed, openUploads }: { ed: Ed; openUploads: () => void }) {
  const { addFiles, busyOut } = ed;
  return (
    <Section>
      <PickButton label="Add a picture or video over the video" accept="image/*,video/*" multiple disabled={busyOut} icon={<PIcon d={PATHS.overlay} />} hint="It lands at the playhead; drag, pinch and twist it in the preview" onFiles={(l) => void addFiles(l, 'overlay')} />
      <Row label="From your uploads" icon={<PIcon d={PATHS.upload} />} onClick={openUploads} />
    </Section>
  );
}

export function UploadsPane({ close }: { close: () => void }) {
  return (
    <div className="pv-uploads">
      <UploadsSheet onClose={close} />
    </div>
  );
}

export function TextSheet({ ed, openCaptions, startTyping }: { ed: Ed; openCaptions: () => void; startTyping: () => void }) {
  const { addText, textLayers, setSel, seek, translate, importSubtitles, busy, busyOut, lang, setLang, script, setScript } = ed;
  return (
    <>
      <Section>
        <Row label="Add text" hint="At the playhead, for 3 seconds" icon={<Icon name="addText" size="1.5rem" />} disabled={busyOut} onClick={() => { addText(); startTyping(); }} />
        <PickButton label="Add subtitles (.srt)" accept=".srt,text/plain" disabled={busyOut} icon={<Icon name="subtitles" size="1.5rem" />} onFiles={(l) => void importSubtitles(l[0]!)} />
        <Row label="Make captions from the speech" icon={<PIcon d={PATHS.captions} />} disabled={busyOut} onClick={openCaptions} />
      </Section>
      <Section title="Translate to Interslavic">
        <TranslateFields lang={lang} setLang={setLang} script={script} setScript={setScript} />
        <Row label="Translate all text" disabled={busy || textLayers.length === 0 || busyOut} icon={<Icon name="translate" size="1.5rem" />} onClick={() => void translate(textLayers.map((l) => l.id))} />
      </Section>
      {textLayers.length > 0 && (
        <Section title="Texts in the video">
          <ol className="pv-text-list" aria-label="Texts in the video">
            {[...textLayers]
              .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
              .map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => { setSel({ kind: 'layer', id: l.id }); seek(l.start ?? 0); }}>
                    <time>{clock(l.start ?? 0)}</time>
                    <span>{l.text || '(empty)'}</span>
                  </button>
                </li>
              ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function TranslateFields(props: { lang: SourceLang; setLang: (l: SourceLang) => void; script: Script; setScript: (s: Script) => void }) {
  return (
    <div className="pv-fields">
      <label>
        <span>Text language</span>
        <select value={props.lang} aria-label="Language of the text" onChange={(e) => props.setLang(e.target.value as SourceLang)}>
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Interslavic script</span>
        <select value={props.script} aria-label="Interslavic script" onChange={(e) => props.setScript(e.target.value as Script)}>
          <option value="standard">Latin</option>
          <option value="cyrillic">Cyrillic</option>
        </select>
      </label>
    </div>
  );
}

export function CaptionsSheet({ ed }: { ed: Ed }) {
  const { lang, setLang, script, setScript, capModel, setCapModel, makeCaptions, captioning, capAbort, busyOut } = ed;
  return (
    <>
      <p className="pv-hint">
        Captions are made from the speech in the videos, <strong>on your device</strong>: nothing is uploaded. The first time, your browser downloads a speech model and keeps it. Read the captions before you use them.
      </p>
      <div className="pv-fields">
        <label>
          <span>Spoken language</span>
          <select value={lang} aria-label="Spoken language" onChange={(e) => setLang(e.target.value as SourceLang)}>
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Model</span>
          <select value={capModel} aria-label="Speech model" onChange={(e) => setCapModel(e.target.value as WhisperModel['id'])}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.downloadMb} MB)
              </option>
            ))}
          </select>
        </label>
      </div>
      <TranslateFields lang={lang} setLang={setLang} script={script} setScript={setScript} />
      {captioning ? (
        <div role="status" className="pv-progress">
          <div className="pv-bar-track" aria-hidden="true">
            <span style={stageFraction(captioning) === null ? undefined : { width: `${Math.round(stageFraction(captioning)! * 100)}%` }} className={stageFraction(captioning) === null ? 'is-moving' : undefined} />
          </div>
          <p>
            {stageText(captioning)} <Elapsed />
          </p>
          <button type="button" className="pv-button" onClick={() => capAbort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="pv-button is-primary" disabled={busyOut} onClick={() => void makeCaptions()}>
          <PIcon d={PATHS.captions} /> Make captions
        </button>
      )}
    </>
  );
}

export function VoiceSheet({ ed }: { ed: Ed }) {
  const { voiceOver, setVoiceOver, voice } = ed;
  if (!canSpeak() || !voice) return <p className="pv-hint">This phone has no voice to read the text aloud.</p>;
  return (
    <>
      <Switch label={voiceOver ? 'Reading the text aloud' : 'Read the text aloud'} on={voiceOver} onChange={setVoiceOver} />
      {voiceOver && <VoicePicker />}
      <p className="pv-hint">Each text is spoken as it appears, and the sound is turned down while it is. You hear this when you play here; it is not part of the saved video, because a browser cannot record its own voices.</p>
    </>
  );
}

export function TransitionSheet({ ed, joint, setJoint }: { ed: Ed; joint: string | null; setJoint: (id: string | null) => void }) {
  const { clips, commit } = ed;
  const idx = joint ? clips.findIndex((c) => c.id === joint) : -1;
  if (idx > 0) {
    return (
      <>
        <p className="pv-hint">Between clip {idx} and clip {idx + 1}.</p>
        <TransitionPicker value={clips[idx]!.transitionIn} max={maxDuration(clips, idx)} onChange={(t) => commit({ clips: clips.map((c, k) => (k === idx ? { ...c, transitionIn: t } : c)) })} />
        {clips.length > 2 && (
          <button type="button" className="pv-button" onClick={() => setJoint(null)}>
            Another join
          </button>
        )}
      </>
    );
  }
  return (
    <Section title="Where?">
      {clips.slice(1).map((c, i) => (
        <Row key={c.id} label={`Between clip ${i + 1} and clip ${i + 2}`} hint={c.transitionIn ? `Now: ${c.transitionIn.kind}` : 'No transition'} icon={<PIcon d={PATHS.transitions} />} onClick={() => setJoint(c.id)} />
      ))}
      {clips.length < 2 && <p className="pv-hint">Add a second clip with the + at the end of the track to join two with a transition.</p>}
    </Section>
  );
}

const BACKGROUNDS = ['#000000', '#ffffff', '#1f2933', '#1f6b6b', '#a34a28'];

export function RatioSheet({ ed }: { ed: Ed }) {
  const { project, commit } = ed;
  const label = ratioLabel(project.frame);
  const current = RATIOS.find((r) => r.label === label)?.id ?? null;
  return (
    <>
      <Chips
        label="Picture ratio"
        value={current}
        options={RATIOS.map((r) => ({ id: r.id, label: r.label }))}
        onChange={(id) => {
          const r = RATIOS.find((x) => x.id === id)!;
          commit({ frame: r.ratio === null ? null : frameForRatio(r.ratio) });
        }}
      />
      <Section title="Background">
        <Chips label="Background colour" value={project.background} options={BACKGROUNDS.map((c) => ({ id: c, aria: c, label: <span className="pv-swatch" style={{ background: c }} /> }))} onChange={(background) => commit({ background })} />
      </Section>
      <p className="pv-hint">The ratio is the shape of the finished video. What does not fill it shows the background.</p>
    </>
  );
}

