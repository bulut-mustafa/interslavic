import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon.tsx';
import * as H from '../../editor/history.ts';
import { updateStyle } from '../../editor/layers.ts';
import type { Deps } from '../../transcribe/run.ts';
import { clock, patchLayer, useVideoEditor } from '../../video/useVideoEditor.ts';
import { defaultVideoStore, type VideoStore } from '../../video/store.ts';
import { sourceOf } from '../../video/project.ts';
import { BottomSheet } from '../BottomSheet.tsx';
import { KeyboardBar } from '../KeyboardBar.tsx';
import { ToolStrip, type StripItem } from '../ToolStrip.tsx';
import { TopBar } from '../TopBar.tsx';
import { PATHS, PIcon, PickButton } from './atoms.tsx';
import { PhonePreview } from './PhonePreview.tsx';
import { PhoneTimeline } from './PhoneTimeline.tsx';
import { AnimateSheet, AudioSheet, CaptionsSheet, EditSheet, EffectsSheet, OpacitySheet, OverlaySheet, RatioSheet, SoundSheet, TextSheet, TextStyleSheet, TransitionSheet, UploadsPane, VoiceSheet } from './sheets.tsx';
import { PHONE_ZOOM } from './scrub-math.ts';
import { diamondOn, isAction, ratioLabel, toggleDiamond, toolsFor, type ToolId } from './tools.ts';
import './phone-video.css';

type SheetTool = ToolId | 'uploads';

const TITLES: Partial<Record<SheetTool, string>> = {
  edit: 'Edit', audio: 'Audio', text: 'Text', overlay: 'Overlay', effects: 'Effects', transitions: 'Transitions', ratio: 'Ratio', captions: 'Captions', voice: 'Read aloud',
  speed: 'Speed', volume: 'Volume', animate: 'Animate', style: 'Text style', opacity: 'Opacity', uploads: 'Your uploads',
};

function iconOf(id: ToolId): ReactNode {
  switch (id) {
    case 'split': return <Icon name="split" size="1.5rem" />;
    case 'volume': return <Icon name="volumeOn" size="1.5rem" />;
    case 'delete': return <Icon name="trash" size="1.5rem" />;
    case 'duplicate': return <Icon name="copy" size="1.5rem" />;
    case 'translate': return <Icon name="translate" size="1.5rem" />;
    case 'text': return <Icon name="addText" size="1.5rem" />;
    case 'speed': return <PIcon d={PATHS.speed} />;
    case 'animate': return <PIcon d={PATHS.animate} />;
    case 'effects': return <PIcon d={PATHS.effects} />;
    case 'transitions': return <PIcon d={PATHS.transitions} />;
    case 'ratio': return <PIcon d={PATHS.ratio} />;
    case 'overlay': return <PIcon d={PATHS.overlay} />;
    case 'captions': return <PIcon d={PATHS.captions} />;
    case 'voice': return <PIcon d={PATHS.voice} />;
    case 'edit': return <PIcon d={PATHS.edit} />;
    case 'audio': return <PIcon d={PATHS.audio} />;
    case 'style': return <PIcon d={PATHS.style} />;
    case 'type': return <PIcon d={PATHS.type} />;
    case 'opacity': return <PIcon d={PATHS.opacity} />;
  }
}

/**
 * The phone's Video editor, CapCut style. It is a second face over the same
 * engine as the desktop page: `useVideoEditor` holds the project, history,
 * transport, saving, export and captions, and this file only lays out touch
 * controls over it (preview, centre-playhead timeline, tool strip, one sheet).
 */
export default function PhoneVideo({ store = defaultVideoStore, makeTranscriber, decodeAudio }: Deps & { store?: VideoStore | null } = {}) {
  const ed = useVideoEditor({ store, makeTranscriber, decodeAudio });
  const { project, clips, sel, hist, ready, restoring, busyOut, exporting, time, length, playing, textLayer, mediaLayer } = ed;
  const [tool, setTool] = useState<SheetTool | null>(null);
  const [zoom, setZoom] = useState(PHONE_ZOOM);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const pendingTool = useRef<SheetTool | null>(null);
  /** The sheet keeps showing the tool it had while it slides away. */
  const lastTool = useRef<SheetTool>('edit');
  if (tool) lastTool.current = tool;
  const shownTool = tool ?? lastTool.current;
  const first = clips[0] ? sourceOf(project, clips[0].srcId) : undefined;

  // The strip belongs to the selection; a new selection closes the sheet of the old one (or opens the one just asked for).
  const selKey = sel ? `${sel.kind}:${sel.id}` : '';
  useEffect(() => {
    setTool(pendingTool.current);
    pendingTool.current = null;
    ed.setJoint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const { mode, items } = toolsFor(project, sel, { canDeleteClip: clips.length > 1 });
  const strip: StripItem[] = items.map((t) => ({ id: t.id, label: t.label, disabled: t.disabled || busyOut, icon: iconOf(t.id) }));

  const act = (id: ToolId) => {
    if (id === 'split') ed.split();
    else if (id === 'delete') ed.removeSelected();
    else if (id === 'duplicate') ed.duplicateSelected();
    else if (id === 'translate' && textLayer) void ed.translate([textLayer.id]);
    else if (id === 'type') {
      setTool(null);
      ed.setTyping(true);
    }
  };
  const onTool = (id: string) => {
    const t = id as ToolId;
    if (isAction(t)) return act(t);
    setTool((cur) => (cur === t ? null : t));
  };

  const layer = mediaLayer ?? textLayer;
  const tLocal = layer ? time - (layer.start ?? 0) : 0;
  const diamond = layer ? diamondOn(layer, tLocal) : false;
  const press = () => {
    if (!layer) return;
    ed.commit({ layers: patchLayer(ed.layers, layer.id, { tracks: toggleDiamond(layer, ed.nowOf(layer), tLocal) }) });
  };

  if (restoring) {
    return (
      <div className="pv" ref={setRootEl}>
        <p className="pv-hint pv-center" role="status">Getting your video back…</p>
      </div>
    );
  }

  const back = <TopBar title={first?.name ?? 'Video'} backHref="/studio" backLabel="Back to Studio" />;

  if (!ready) {
    return (
      <div className="pv" ref={setRootEl}>
        {back}
        <div className="pv-empty">
          <PickButton primary label="Choose a video" accept="video/*" hint="MP4, WebM, MOV. It stays on your phone." icon={<PIcon d={PATHS.overlay} size={28} />} onFiles={(l) => ed.requestOpen(l[0]!)} />
          <button type="button" className="pv-button" onClick={() => setTool('uploads')}>
            <PIcon d={PATHS.upload} /> From your uploads
          </button>
          {ed.restoreFailed && <p className="pv-note is-error" role="alert">Your saved video could not be read just now, so you are starting empty. It is still on this device and may come back after a reload.</p>}
          {ed.error && <p className="pv-note is-error" role="alert">{ed.error}</p>}
        </div>
        <BottomSheet open={tool === 'uploads'} onClose={() => setTool(null)} title="Your uploads" heightTarget={rootEl}>
          <div className="pv-sheet-body"><UploadsPane close={() => setTool(null)} /></div>
        </BottomSheet>
      </div>
    );
  }

  const body = (() => {
    switch (shownTool) {
      case 'edit': return <EditSheet ed={ed} close={() => setTool(null)} />;
      case 'audio': return <AudioSheet ed={ed} />;
      case 'text': return <TextSheet ed={ed} openCaptions={() => setTool('captions')} startTyping={() => { setTool(null); ed.setTyping(true); }} />;
      case 'overlay': return <OverlaySheet ed={ed} openUploads={() => setTool('uploads')} />;
      case 'uploads': return <UploadsPane close={() => setTool(null)} />;
      case 'effects': return <EffectsSheet ed={ed} onPick={(s) => { pendingTool.current = 'effects'; ed.setSel(s); }} />;
      case 'transitions': return <TransitionSheet ed={ed} joint={ed.joint} setJoint={ed.setJoint} />;
      case 'ratio': return <RatioSheet ed={ed} />;
      case 'captions': return <CaptionsSheet ed={ed} />;
      case 'voice': return <VoiceSheet ed={ed} />;
      case 'speed': return <SoundSheet ed={ed} parts="speed" />;
      case 'volume': return <SoundSheet ed={ed} parts="sound" />;
      case 'animate': return <AnimateSheet ed={ed} />;
      case 'style': return <TextStyleSheet ed={ed} />;
      case 'opacity': return <OpacitySheet ed={ed} />;
      default: return null;
    }
  })();

  const pct = exporting ? Math.round((exporting.at / Math.max(exporting.of, 0.001)) * 100) : 0;
  const style = textLayer?.style;
  const setStyle = (patch: object) => textLayer && ed.commitMerge(`x:${textLayer.id}:${Object.keys(patch).join()}`, { layers: patchLayer(ed.layers, textLayer.id, { style: updateStyle([textLayer], textLayer.id, patch)[0]!.style }) });
  const keep = (e: { preventDefault: () => void }) => e.preventDefault(); // pressing a bar button must not take the focus off the text box (it would close the keyboard)

  return (
    <div ref={setRootEl} className={`pv${tool ? ' has-sheet' : ''}${ed.typing ? ' is-typing' : ''}`} data-testid="phone-video">
      <TopBar
        title={first?.name ?? 'Video'}
        backHref="/studio"
        backLabel="Back to Studio"
        right={
          <>
            <button type="button" className="pv-chip-btn" aria-label={`Picture ratio ${ratioLabel(project.frame)}`} disabled={busyOut} onClick={() => setTool((t) => (t === 'ratio' ? null : 'ratio'))}>
              <PIcon d={PATHS.ratio} size={18} /> {ratioLabel(project.frame)}
            </button>
            <button type="button" className="pv-export" disabled={busyOut} onClick={() => void ed.save()}>
              Export
            </button>
          </>
        }
      />

      {exporting && (
        <div className="pv-card" role="status" aria-label="Exporting">
          <div className="pv-bar-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
          <p>Saving… {pct}%. The video is recorded at its own speed, so keep this tab open.</p>
          <button type="button" className="pv-button" onClick={() => ed.abort.current?.abort()}>Cancel</button>
        </div>
      )}
      {ed.incoming && (
        <div className="pv-card" role="alertdialog" aria-label="Replace the video?">
          <p>Open <strong>{ed.incoming.file.name}</strong> instead? Your edits to the current video will be lost.</p>
          <div className="pv-card-actions">
            <button type="button" className="pv-button is-primary" onClick={() => void ed.startFresh(ed.incoming!.file, ed.incoming!.item)}>Open it</button>
            <button type="button" className="pv-button" onClick={() => ed.setIncoming(null)}>Keep editing</button>
          </div>
        </div>
      )}
      {ed.kept === 'failed' && <p className="pv-note is-error" role="alert">Could not keep this video on this phone (it may be out of room). Export it before you leave.</p>}
      {ed.error && !exporting && (
        <p className="pv-note is-error" role="alert">
          {ed.error} <button type="button" className="pv-link" onClick={() => ed.setError(null)}>Dismiss</button>
        </p>
      )}
      {ed.status && !exporting && (
        <p className="pv-note" role="status">
          {ed.status} <button type="button" className="pv-link" onClick={() => ed.setStatus(null)}>Dismiss</button>
        </p>
      )}

      <div className="pv-preview" inert={busyOut}>
        <PhonePreview ed={ed} />
      </div>

      <div className="pv-transport" role="toolbar" aria-label="Playback" inert={busyOut}>
        <span className="pv-time" aria-label="Time">
          <b>{clock(time)}</b> / {clock(length)}
        </span>
        <button type="button" className="pv-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => void ed.togglePlay()}>
          <Icon name={playing ? 'pause' : 'play'} size="1.6rem" />
        </button>
        <span className="pv-transport-right">
          <button type="button" className="pv-icon-btn" aria-label="Undo" disabled={!H.canUndo(hist)} onClick={() => ed.setHist((h) => H.undo(h))}>
            <Icon name="undo" size="1.4rem" />
          </button>
          <button type="button" className="pv-icon-btn" aria-label="Redo" disabled={!H.canRedo(hist)} onClick={() => ed.setHist((h) => H.redo(h))}>
            <Icon name="redo" size="1.4rem" />
          </button>
          <button type="button" className={`pv-icon-btn pv-diamond${diamond ? ' is-on' : ''}`} aria-label={diamond ? 'Remove keyframe' : 'Add keyframe'} aria-pressed={diamond} disabled={!layer} onClick={press}>
            <PIcon d={PATHS.diamond} size={24} />
          </button>
        </span>
      </div>

      <div className="pv-bottom" inert={busyOut}>
        <PhoneTimeline
          project={project}
          time={time}
          playing={playing}
          selection={sel}
          zoom={zoom}
          onZoom={setZoom}
          strips={ed.strips}
          snapping={ed.snapping}
          disabled={busyOut}
          onSeek={ed.seek}
          onScrubStart={() => { if (ed.transportRef.current?.playing) void ed.togglePlay(); }}
          onSelect={(s) => { ed.setSel(s); ed.setTyping(false); }}
          onChange={ed.change}
          onTransition={(id) => { ed.setJoint(id); setTool('transitions'); }}
          onAddFiles={(l) => void ed.addFiles(l, 'append')}
        />
        <ToolStrip items={strip} selected={tool} onSelect={onTool} mode={mode} label="Video tools" />
      </div>

      <BottomSheet open={tool !== null} onClose={() => setTool(null)} title={TITLES[shownTool] ?? 'Tool'} heightTarget={rootEl} headerAction={<button type="button" className="pv-done" onClick={() => setTool(null)}>Done</button>}>
        <div className="pv-sheet-body">{body}</div>
      </BottomSheet>

      <KeyboardBar label="Text tools">
        <button type="button" className="pv-kb-done" onPointerDown={keep} onMouseDown={keep} onClick={() => ed.setTyping(false)}>Done</button>
        {style && (
          <>
            <button type="button" aria-label="Smaller text" onPointerDown={keep} onMouseDown={keep} onClick={() => setStyle({ size: Math.max(8, Math.round(style.size * 0.9)) })}><Icon name="minus" size="1.2rem" /></button>
            <button type="button" aria-label="Larger text" onPointerDown={keep} onMouseDown={keep} onClick={() => setStyle({ size: Math.round(style.size * 1.1) })}><Icon name="plus" size="1.2rem" /></button>
            <button type="button" aria-label="Bold" aria-pressed={style.bold} onPointerDown={keep} onMouseDown={keep} onClick={() => setStyle({ bold: !style.bold })}><Icon name="bold" size="1.2rem" /></button>
            <button type="button" aria-label="Translate this text to Interslavic" disabled={ed.busy} onPointerDown={keep} onMouseDown={keep} onClick={() => void ed.translate([textLayer!.id])}><Icon name="translate" size="1.2rem" /></button>
          </>
        )}
      </KeyboardBar>
    </div>
  );
}

/** The registry entry (phone/registry.ts): the Studio's Video tool on a phone. */
export const phoneVideo = () => <PhoneVideo />;
