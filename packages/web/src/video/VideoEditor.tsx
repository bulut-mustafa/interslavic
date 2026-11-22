import { DropZone } from '../components/DropZone.tsx';
import { ReplaceBanner } from '../components/ReplaceBanner.tsx';
import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { VoicePicker } from '../speech/Listen.tsx';
import { supported as canSpeak } from '../speech/voices.ts';
import { Inspector } from '../editor/Inspector.tsx';
import { MediaInspector } from '../editor/MediaInspector.tsx';
import { EffectsPanel } from '../editor/EffectsPanel.tsx';
import { KeyframePanel } from '../editor/KeyframePanel.tsx';
import { SpeedAudioPanel } from '../editor/SpeedAudioPanel.tsx';
import { TransitionPicker } from '../editor/TransitionPicker.tsx';
import { TransformBox } from '../editor/TransformBox.tsx';
import { boxOfMedia, patchOfBox } from '../editor/transform-math.ts';
import { LayerCanvas } from '../editor/LayerCanvas.tsx';
import { SelectionOverlay } from '../editor/SelectionOverlay.tsx';
import * as H from '../editor/history.ts';
import { updateStyle } from '../editor/layers.ts';
import { applyPreset } from '../editor/text-style.ts';
import { type Script, type SourceLang } from '../subtitles/translate.ts';
import { MODELS, type WhisperModel } from '../transcribe/models.ts';
import { Elapsed } from '../transcribe/Elapsed.tsx';
import { stageFraction, stageText, type Deps } from '../transcribe/run.ts';
import {
  sourceOf, 
  type AudioLayer, type Layer,
} from './project.ts';
import { maxDuration } from './transitions.ts';
import { defaultVideoStore, type VideoStore } from './store.ts';
import { Timeline } from './Timeline.tsx';
import './editor.css';
import './mobile-video.css';
import { MIN_CLIP, length as clipLength, locate, speedOf, trim, type Clip } from './timeline.ts';
import { useVideoEditor, clock, patchLayer, LANGS, EMPTY_FEED } from './useVideoEditor.ts';

/**
 * A video editor: several videos one after another on the main track, pictures,
 * videos and sounds placed over or beside them on lanes, and styled text - all
 * timed by dragging on the timeline. Subtitles can be brought in, made from the
 * speech, and translated into Interslavic. It all runs in the browser; nothing
 * leaves the device.
 */
export default function VideoEditor({ store = defaultVideoStore, makeTranscriber, decodeAudio }: Deps & { store?: VideoStore | null } = {}) {
  const {
    hist,
    setHist,
    sel,
    setSel,
    time,
    playing,
    muted,
    setMuted,
    volume,
    setVolume,
    voiceOver,
    setVoiceOver,
    voice,
    transportRef,
    lang,
    setLang,
    script,
    setScript,
    status,
    error,
    busy,
    exporting,
    typing,
    setTyping,
    strips,
    zoom,
    setZoom,
    snapping,
    setSnapping,
    view,
    setView,
    askCaptions,
    setAskCaptions,
    capModel,
    setCapModel,
    captioning,
    restoring,
    restoreFailed,
    kept,
    transport,
    setJoint,
    incoming,
    setIncoming,
    scene,
    wrap,
    abort,
    capAbort,
    project,
    clips,
    layers,
    projectRef,
    ready,
    commit,
    commitMerge,
    length,
    frame,
    selClip,
    clipIndex,
    selLayer,
    textLayer,
    mediaLayer,
    audioLayer,
    textLayers,
    jointIndex,
    nowOf,
    patchKeyed,
    shownText,
    onFrame,
    seek,
    togglePlay,
    change,
    startFresh,
    addFiles,
    requestOpen,
    split,
    removeSelected,
    withSpeed,
    duplicateSelected,
    orderSelected,
    clearAll,
    first,
    nothingToClear,
    freeze,
    extractSound,
    selSourceKind,
    canFreeze,
    addText,
    importSubtitles,
    translate,
    makeCaptions,
    save,
    busyOut,
    files,
  } = useVideoEditor({ store, makeTranscriber, decodeAudio });

  if (restoring) {
    return (
      <main className="editor-page">
        <p className="note" role="status">
          Getting your video back…
        </p>
      </main>
    );
  }

  return (
    <main className="editor-page">
      {!ready && (
        <>
          <h1>Video editor</h1>
          <p className="lesson-summary">Cut videos together and put pictures, sounds and text on them, even translated. The videos stay on your device.</p>
          {restoreFailed && (
            <p className="error-line" role="alert">
              Your saved video could not be read just now, so you are starting empty. It is still on this device and may come back after a reload.
            </p>
          )}
          <DropZone
            name="Video to edit"
            title="Drop a video here, or click to browse"
            hint="MP4, WebM, MOV"
            accept="video/*"
            kind="video"
            noun="a video"
            file={null}
            onFile={(f) => requestOpen(f)}
          />
          {error && (
            <p className="error-line" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {ready && (
        <div className="editor">
          <div className="editor-stage">
            {incoming && <ReplaceBanner noun="video" name={incoming.file.name} onReplace={() => void startFresh(incoming.file, incoming.item)} onKeep={() => setIncoming(null)} />}

            <div className="editor-bar" role="toolbar" aria-label="Video tools">
              <span className="editor-file" title={first?.name}>
                {first?.name}
              </span>
              <Tip label="Add a video, picture or sound" side="bottom">
                <label className={`icon-button open-another${busyOut ? ' is-disabled' : ''}`}>
                  <Icon name="plus" />
                  <input
                    type="file"
                    multiple
                    accept="video/*,image/*,audio/*"
                    aria-label="Add a video, picture or sound"
                    disabled={busyOut}
                    onChange={(e) => {
                      const list = [...(e.target.files ?? [])];
                      e.target.value = '';
                      if (list.length > 0) void addFiles(list, 'append');
                    }}
                  />
                </label>
              </Tip>
              <Tip label="Add text" side="bottom">
                <button type="button" className="icon-button" aria-label="Add text" onClick={addText} disabled={busyOut}>
                  <Icon name="addText" />
                </button>
              </Tip>
              <Tip label="Add subtitles (.srt)" side="bottom">
                <label className={`icon-button open-another${busyOut ? ' is-disabled' : ''}`}>
                  <Icon name="subtitles" />
                  <input
                    type="file"
                    accept=".srt,text/plain"
                    aria-label="Subtitles to add as text (.srt)"
                    disabled={busyOut}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importSubtitles(f);
                    }}
                  />
                </label>
              </Tip>
              <Tip label="Make captions from the speech" side="bottom">
                <button type="button" className="icon-button" aria-label="Make captions from the speech" aria-expanded={askCaptions} disabled={busyOut || captioning !== null} onClick={() => setAskCaptions((a) => !a)}>
                  <Icon name="mic" />
                </button>
              </Tip>
              <Tip label="Translate all text to Interslavic" side="bottom">
                <button type="button" className="icon-button" aria-label="Translate all text to Interslavic" disabled={busy || textLayers.length === 0 || busyOut} onClick={() => void translate(textLayers.map((l) => l.id))}>
                  <Icon name="translate" />
                </button>
              </Tip>
              <span className="editor-gap" />
              {store && kept === 'saved' && <span className="page-kept">Kept on this device</span>}
              <Tip label="Undo" side="bottom">
                <button type="button" className="icon-button" aria-label="Undo" disabled={!H.canUndo(hist) || busyOut} onClick={() => setHist((h) => H.undo(h))}>
                  <Icon name="undo" />
                </button>
              </Tip>
              <Tip label="Redo" side="bottom">
                <button type="button" className="icon-button" aria-label="Redo" disabled={!H.canRedo(hist) || busyOut} onClick={() => setHist((h) => H.redo(h))}>
                  <Icon name="redo" />
                </button>
              </Tip>
              <Tip label="Clear everything (all text and cuts)" side="bottom">
                <button type="button" className="icon-button" aria-label="Clear everything: all text and cuts" disabled={nothingToClear || busyOut} onClick={clearAll}>
                  <Icon name="trash" />
                </button>
              </Tip>
              {exporting ? (
                <button type="button" className="text-button" onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              ) : (
                <Tip label="Save video" side="bottom">
                  <button type="button" className="icon-button is-primary" aria-label="Save video" onClick={() => void save()}>
                    <Icon name="save" />
                  </button>
                </Tip>
              )}
            </div>

            {exporting && (
              <div role="status" className="export-progress">
                <div className="progress-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((exporting.at / Math.max(exporting.of, 0.001)) * 100)}%` }} />
                </div>
                <p className="note">Saving… {Math.round((exporting.at / Math.max(exporting.of, 0.001)) * 100)}%. The video is recorded at its own speed, so keep this tab open.</p>
              </div>
            )}

            {store && kept === 'failed' && (
              <p className="error-line" role="alert">
                Could not keep this video on this device (the browser may be out of room). Save it before you leave.
              </p>
            )}

            {askCaptions && (
              <div className="replace-banner caption-ask" role="dialog" aria-label="Make captions">
                <p>
                  Captions are made from the speech in the videos, <strong>on your device</strong>: nothing is uploaded. The first time, your browser downloads a speech model and keeps it. Quality depends on the language and the sound, so read the captions before you use them.
                </p>
                <div className="insp-line">
                  <label className="sub-field">
                    <span>Spoken language</span>
                    <select value={lang} onChange={(e) => setLang(e.target.value as SourceLang)} aria-label="Spoken language">
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sub-field">
                    <span>Model</span>
                    <select value={capModel} onChange={(e) => setCapModel(e.target.value as WhisperModel['id'])} aria-label="Speech model">
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.downloadMb} MB)
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="text-button is-primary" onClick={() => void makeCaptions()}>
                    <Icon name="mic" /> Make captions
                  </button>
                  <button type="button" className="text-button" onClick={() => setAskCaptions(false)}>
                    Not now
                  </button>
                </div>
              </div>
            )}

            {captioning && (
              <div role="status" className="transcribe-progress">
                <div className="progress-bar" aria-hidden="true">
                  <span className={stageFraction(captioning) === null ? 'is-moving' : undefined} style={stageFraction(captioning) === null ? undefined : { width: `${Math.round(stageFraction(captioning)! * 100)}%` }} />
                </div>
                <p>
                  {stageText(captioning)} <Elapsed />{' '}
                  <button type="button" className="text-button" onClick={() => capAbort.current?.abort()}>
                    Cancel
                  </button>
                </p>
              </div>
            )}

            <div className="canvas-wrap" ref={wrap} tabIndex={-1} inert={busyOut}>
              <LayerCanvas
                ref={scene}
                width={frame.w}
                height={frame.h}
                layers={shownText}
                project={project}
                media={transport ?? EMPTY_FEED}
                time={time}
                selectedId={sel?.kind === 'layer' ? sel.id : null}
                onSelect={(id) => {
                  setSel(id ? { kind: 'layer', id } : null);
                  setTyping(false);
                }}
                onActivate={(id) => {
                  setSel({ kind: 'layer', id });
                  setTyping(true);
                }}
                onDrag={(id, x, y) => change({ layers: patchKeyed(projectRef.current.layers, id, { x, y }) }, 'preview')}
                onDragEnd={() => change({}, 'end')}
                label="The video frame. Drag text to move it; arrow keys nudge the selected text; Enter types on it."
              />
              <SelectionOverlay
                scene={scene}
                wrap={wrap}
                active={onFrame}
                watch={[onFrame, frame, ready]}
                typing={typing}
                onView={setView}
                onType={(text) => commitMerge(`t:${textLayer!.id}`, { layers: patchLayer(layers, textLayer!.id, { text }) })}
                onStopTyping={() => setTyping(false)}
                toolbar={
                  <>
                    <button type="button" className="is-main" disabled={busy || busyOut} onClick={() => void translate([textLayer!.id])}>
                      <Icon name="translate" /> Translate
                    </button>
                    <button type="button" onClick={() => setTyping(true)}>
                      <Icon name="edit" /> Edit
                    </button>
                    <button type="button" aria-label="Remove this text" title="Remove this text" onClick={removeSelected}>
                      <Icon name="trash" />
                    </button>
                  </>
                }
              />
              {mediaLayer && view && (
                <TransformBox
                  box={boxOfMedia(nowOf(mediaLayer))}
                  view={view}
                  frame={frame}
                  label={`Selected ${sourceOf(project, mediaLayer.srcId)?.kind === 'image' ? 'picture' : 'video'}`}
                  onChange={(box, mode) => change({ layers: patchKeyed(projectRef.current.layers, mediaLayer.id, patchOfBox(box)) }, mode)}
                />
              )}
            </div>

            <div className="transport" inert={busyOut}>
              <button type="button" className="icon-button is-play" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()} disabled={busyOut}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button type="button" className="icon-button transport-step" aria-label="Back one frame" title="Back one frame (Left arrow)" onClick={() => seek(Math.max(0, time - 1 / 30))} disabled={busyOut || !ready}>
                ‹
              </button>
              <span className="transport-time">
                {clock(time)} / {clock(length)}
              </span>
              <button type="button" className="icon-button transport-step" aria-label="Forward one frame" title="Forward one frame (Right arrow)" onClick={() => seek(time + 1 / 30)} disabled={busyOut || !ready}>
                ›
              </button>
              <span className="editor-gap" />
              <button type="button" className="icon-button" aria-label="Duplicate" title="Duplicate the selected layer (Ctrl+D)" disabled={!selLayer || busyOut} onClick={duplicateSelected}>
                <Icon name="copy" />
              </button>
              <button type="button" className="icon-button" aria-label="Split at playhead" title="Split at playhead (S)" onClick={split} disabled={busyOut}>
                <Icon name="split" />
              </button>
              <button type="button" className="icon-button" aria-label="Freeze frame" title="Freeze frame: hold this picture for 3 seconds" onClick={() => void freeze()} disabled={busyOut || !ready || !canFreeze}>
                <Icon name="image" />
              </button>
              <button type="button" className="icon-button" aria-label="Delete" title="Delete the selected item" disabled={(!selLayer && !(selClip && clips.length > 1)) || busyOut} onClick={removeSelected}>
                <Icon name="trash" />
              </button>
            </div>

            <div inert={busyOut}>
            <Timeline
              project={project}
              time={time}
              selection={sel}
              zoom={zoom}
              onZoom={setZoom}
              snapping={snapping}
              onSnapping={setSnapping}
              strips={strips}
              onSeek={seek}
              onSelect={(x) => {
                setSel(x);
                setJoint(null);
              }}
              onTransition={setJoint}
              fileOf={files.fileOf}
              onChange={change}
              onScrubStart={() => {
                if (transportRef.current?.playing) void togglePlay();
              }}
            />
            </div>

            {status && !exporting && (
              <p role="status" className="note">
                {status}
              </p>
            )}
            {error && (
              <p className="error-line" role="alert">
                {error}
              </p>
            )}
          </div>

          <aside className="editor-side" aria-label="Controls" inert={busyOut}>
            {textLayer ? (
              <Inspector
                layer={textLayer}
                frame={frame}
                onText={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })}
                onStyle={(patch) => commit({ layers: patchLayer(layers, textLayer.id, { style: updateStyle([textLayer], textLayer.id, patch)[0]!.style }) })}
                onPreset={(id) => commit({ layers: patchLayer(layers, textLayer.id, { style: applyPreset(textLayer.style, id) }) })}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
                onFront={() => orderSelected('front')}
                onInsertWord={(w) => commit({ layers: patchLayer(layers, textLayer.id, { text: textLayer.text + (textLayer.text && !/\s$/.test(textLayer.text) ? ' ' : '') + w }) })}
                extra={
                  <>
                    <div className="insp-actions">
                      <button type="button" className="text-button is-primary" disabled={busy} onClick={() => void translate([textLayer.id])}>
                        Translate to Interslavic
                      </button>
                      {textLayer.original !== undefined && textLayer.original !== textLayer.text && (
                        <button type="button" className="text-button" onClick={() => commit({ layers: patchLayer(layers, textLayer.id, { text: textLayer.original! }) })}>
                          Restore original
                        </button>
                      )}
                    </div>
                    <TimeFields layer={textLayer} length={length} time={time} onPatch={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })} />
                    <KeyframePanel
                      layer={nowOf(textLayer)}
                      tLocal={time - (textLayer.start ?? 0)}
                      tracks={textLayer.tracks ?? []}
                      anims={textLayer.anims}
                      props={['x', 'y', 'rotation']}
                      onChange={(patch) => commit({ layers: patchLayer(layers, textLayer.id, patch) })}
                      onSeekLocal={(t) => seek((textLayer.start ?? 0) + t)}
                    />
                  </>
                }
              />
            ) : mediaLayer ? (
              <>
                <MediaInspector
                  layer={nowOf(mediaLayer)}
                  source={sourceOf(project, mediaLayer.srcId)}
                  frame={frame}
                  onChange={(patch) => commitMerge(`i:${mediaLayer.id}:${Object.keys(patch).join()}`, { layers: patchKeyed(layers, mediaLayer.id, patch) })}
                  onOrder={orderSelected}
                  onDuplicate={duplicateSelected}
                  onDelete={removeSelected}
                />
                {selSourceKind === 'video' && (
                  <SpeedAudioPanel
                    speed={mediaLayer.speed ?? 1}
                    volume={mediaLayer.volume ?? 1}
                    fadeIn={mediaLayer.fadeIn ?? 0}
                    fadeOut={mediaLayer.fadeOut ?? 0}
                    duration={mediaLayer.end - mediaLayer.start}
                    onChange={(patch) => commitMerge(`s:${mediaLayer.id}:${Object.keys(patch).join()}`, { layers: patchLayer(layers, mediaLayer.id, withSpeed(mediaLayer, patch)) })}
                    onExtract={extractSound}
                  />
                )}
                <EffectsPanel
                  adjust={mediaLayer.adjust ?? {}}
                  mask={mediaLayer.mask}
                  chroma={mediaLayer.chroma}
                  onChange={(patch) => commitMerge(`e:${mediaLayer.id}`, { layers: patchLayer(layers, mediaLayer.id, patch) })}
                />
                <KeyframePanel
                  layer={nowOf(mediaLayer)}
                  tLocal={time - mediaLayer.start}
                  tracks={mediaLayer.tracks ?? []}
                  anims={mediaLayer.anims}
                  props={['x', 'y', 'w', 'h', 'rotation', 'opacity']}
                  onChange={(patch) => commit({ layers: patchLayer(layers, mediaLayer.id, patch) })}
                  onSeekLocal={(t) => seek(mediaLayer.start + t)}
                />
              </>
            ) : audioLayer ? (
              <AudioPanel
                layer={audioLayer}
                name={sourceOf(project, audioLayer.srcId)?.name ?? 'Sound'}
                length={length}
                time={time}
                onPatch={(patch) => commitMerge(`a:${audioLayer.id}:${Object.keys(patch).join()}`, { layers: patchLayer(layers, audioLayer.id, withSpeed(audioLayer, patch)) })}
                onDelete={removeSelected}
              />
            ) : jointIndex > 0 ? (
              <section className="inspector" aria-label="Transition">
                <h3 className="insp-title">Transition</h3>
                <p className="note">Between clip {jointIndex} and clip {jointIndex + 1}.</p>
                <TransitionPicker
                  value={clips[jointIndex]!.transitionIn}
                  max={maxDuration(clips, jointIndex)}
                  onChange={(t) => commit({ clips: clips.map((c, k) => (k === jointIndex ? { ...c, transitionIn: t } : c)) })}
                />
                <div className="insp-actions">
                  <button type="button" className="text-button" onClick={() => setJoint(null)}>
                    Done
                  </button>
                </div>
              </section>
            ) : selClip ? (
              <>
                <ClipPanel
                  index={clipIndex}
                  clip={selClip}
                  duration={sourceOf(project, selClip.srcId)?.duration ?? Math.max(selClip.end, 3600)}
                  name={sourceOf(project, selClip.srcId)?.name ?? 'Video'}
                  playheadSource={locate(clips, time)?.index === clipIndex ? locate(clips, time)!.source : null}
                  onTrim={(patch) => commit({ clips: trim(clips, clipIndex, patch, sourceOf(project, selClip.srcId)?.duration ?? Math.max(selClip.end, 3600)) })}
                />
                {selSourceKind !== 'image' && (
                  <SpeedAudioPanel
                    speed={speedOf(selClip)}
                    volume={selClip.volume ?? 1}
                    fadeIn={selClip.fadeIn ?? 0}
                    fadeOut={selClip.fadeOut ?? 0}
                    duration={clipLength(selClip)}
                    onChange={(patch) => commitMerge(`c:${selClip.id}:${Object.keys(patch).join()}`, { clips: clips.map((c) => (c.id === selClip.id ? { ...c, ...patch } : c)) })}
                    onExtract={selSourceKind === 'video' ? extractSound : undefined}
                  />
                )}
                {clipIndex > 0 && (
                  <section className="inspector" aria-label="Transition">
                    <button type="button" className="text-button" onClick={() => setJoint(selClip.id)}>
                      Transition from the clip before…
                    </button>
                  </section>
                )}
              </>
            ) : (
              <section className="inspector is-idle" aria-label="Video settings">
                <p className="note">Click something in the video or on the timeline to change it. Drag the ends of a bar on the timeline to set how long it shows.</p>
                <label className="insp-row">
                  <span>Text language</span>
                  <select value={lang} onChange={(e) => setLang(e.target.value as SourceLang)} aria-label="Language of the text">
                    {LANGS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="insp-row">
                  <span>Interslavic script</span>
                  <select value={script} onChange={(e) => setScript(e.target.value as Script)} aria-label="Interslavic script">
                    <option value="standard">Latin</option>
                    <option value="cyrillic">Cyrillic</option>
                  </select>
                </label>
                <p className="insp-title">Sound</p>
                <button type="button" className={`switch${muted ? ' is-on' : ''}`} role="switch" aria-checked={muted} onClick={() => setMuted((m) => !m)}>
                  <Icon name={muted ? 'volumeOff' : 'volumeOn'} />
                  <span>{muted ? 'Sound is off' : 'Sound is on'}</span>
                </button>
                <label className="insp-row">
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={muted} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value) / 100)} />
                </label>
                {canSpeak() && voice && (
                  <>
                    <button type="button" className={`switch${voiceOver ? ' is-on' : ''}`} role="switch" aria-checked={voiceOver} onClick={() => setVoiceOver((v) => !v)}>
                      <Icon name="mic" />
                      <span>{voiceOver ? 'Reading the text aloud' : 'Read the text aloud'}</span>
                    </button>
                    {voiceOver && <VoicePicker />}
                    <p className="note">
                      Each text is spoken as it appears, and the sound is turned down while it is. You hear this when you play here; it is not part of the saved video, because a browser cannot record its own voices.
                    </p>
                  </>
                )}
                {textLayers.length > 0 && (
                  <>
                    <p className="insp-title">Texts</p>
                    <ol className="text-list" aria-label="Texts in the video">
                      {[...textLayers]
                        .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
                        .map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSel({ kind: 'layer', id: l.id });
                                seek(l.start ?? 0);
                              }}
                            >
                              <time>{clock(l.start ?? 0)}</time>
                              <span>{l.text || '(empty)'}</span>
                            </button>
                          </li>
                        ))}
                    </ol>
                  </>
                )}
                <p className="note">Other Slavic languages: choose Edit and type them.</p>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

/** When a text or sound is shown, as numbers: the same thing the timeline does by dragging. */
function TimeFields(props: { layer: Layer; length: number; time: number; onPatch: (patch: { start?: number; end?: number }) => void }) {
  const { layer, length, time } = props;
  const start = layer.start ?? 0;
  const end = layer.end ?? length;
  return (
    <div className="insp-times">
      <label>
        <span>Shown from (s)</span>
        <input type="number" aria-label="Shown from (seconds)" min={0} max={length} step={0.1} value={Number(start.toFixed(2))} onChange={(e) => props.onPatch({ start: Math.min(Math.max(0, Number(e.target.value)), end - 0.1) })} />
      </label>
      <button type="button" className="icon-button" aria-label="Start at playhead" title="Start at the playhead" onClick={() => props.onPatch({ start: Math.min(time, end - 0.1) })}>
        <Icon name="check" size="0.9rem" />
      </button>
      <label>
        <span>Until (s)</span>
        <input type="number" aria-label="Shown until (seconds)" min={0} max={length} step={0.1} value={Number(end.toFixed(2))} onChange={(e) => props.onPatch({ end: Math.min(length, Math.max(Number(e.target.value), start + 0.1)) })} />
      </label>
      <button type="button" className="icon-button" aria-label="End at playhead" title="End at the playhead" onClick={() => props.onPatch({ end: Math.max(time, start + 0.1) })}>
        <Icon name="check" size="0.9rem" />
      </button>
    </div>
  );
}

/** A sound laid on the edit: its volume and where it plays. */
function AudioPanel(props: { layer: AudioLayer; name: string; length: number; time: number; onPatch: (patch: Partial<AudioLayer>) => void; onDelete: () => void }) {
  const { layer } = props;
  return (
    <section className="inspector" aria-label="Sound settings">
      <h3 className="insp-title">{props.name}</h3>
      <SpeedAudioPanel
        speed={layer.speed ?? 1}
        volume={layer.volume ?? 1}
        fadeIn={layer.fadeIn ?? 0}
        fadeOut={layer.fadeOut ?? 0}
        duration={layer.end - layer.start}
        onChange={(patch) => props.onPatch(patch)}
      />
      <TimeFields layer={layer} length={props.length} time={props.time} onPatch={props.onPatch} />
      <div className="insp-actions">
        <button type="button" className="text-button" onClick={props.onDelete}>
          <Icon name="trash" /> Remove sound
        </button>
      </div>
    </section>
  );
}

/** Trimming the selected clip: where in the original video it starts and ends. */
function ClipPanel(props: {
  index: number;
  clip: Clip;
  duration: number;
  name: string;
  /** Where the playhead is in the original video, when it is inside this clip. */
  playheadSource: number | null;
  onTrim: (patch: { start?: number; end?: number }) => void;
}) {
  const { clip } = props;
  return (
    <section className="inspector" aria-label="Clip settings">
      <h2 className="insp-title">Clip {props.index + 1}: {props.name}</h2>
      <p className="note">Trimming changes only what plays; you can always trim back out.</p>
      <label className="insp-row">
        <span>Starts at</span>
        <input type="number" aria-label="Clip starts at (seconds)" min={0} max={props.duration} step={0.1} value={Number(clip.start.toFixed(2))} onChange={(e) => props.onTrim({ start: Number(e.target.value) })} />
      </label>
      <label className="insp-row">
        <span>Ends at</span>
        <input type="number" aria-label="Clip ends at (seconds)" min={0} max={props.duration} step={0.1} value={Number(clip.end.toFixed(2))} onChange={(e) => props.onTrim({ end: Number(e.target.value) })} />
      </label>
      <div className="insp-actions">
        <button type="button" className="text-button" disabled={props.playheadSource === null} onClick={() => props.onTrim({ start: props.playheadSource! })}>
          Start at playhead
        </button>
        <button type="button" className="text-button" disabled={props.playheadSource === null} onClick={() => props.onTrim({ end: props.playheadSource! })}>
          End at playhead
        </button>
      </div>
      <p className="note">Length {clock(clip.end - clip.start)} (at least {MIN_CLIP}s).</p>
    </section>
  );
}
