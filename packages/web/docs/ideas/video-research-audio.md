# Audio, speed, freeze frame and waveform research (part I)

Files: `src/video/audio.ts`, `freeze.ts`, `waveform.ts`, `src/editor/SpeedAudioPanel.tsx`. Pages were fetched on 2026-11-09 and summarised by the fetch tool; quotes are from that output. Nothing was run in a real browser.

## (a) CapCut behaviour (third-party only: no official help page was reachable)

| Topic | What the sources say | Source |
| --- | --- | --- |
| Speed | Two modes: Normal (constant, 0.1x to 100x) and Curve (non-linear ramps). Another guide says Curve presets/custom run 0.1x to 10x. Strong slowdowns can show repeated frames. | https://vocalremover.easeus.com/ai-article/how-to-speed-up-a-video-on-capcut.html (and the web search results on capcut.com/resource/how-to-speed-up-a-video) |
| Volume and fade | Fade controls are in the audio clip's Basic panel (desktop); volume and fade are separate settings, set the volume you want before fading; picture fades are separate (Animation > Fade) | https://capcutguide.com/fade-out-audio-in-capcut/ , https://store.hollyland.com/blogs/creator-hub/fade-out-audio-in-capcut |
| Extract audio | An "Extracted" option in the Audio panel pulls sound from an imported video | https://unifab.ai/resource/how-to-use-capcut |
| Freeze frame | Playhead on the frame, select clip, Freeze (toolbar or right-click). The clip is split and an independent still-image clip is inserted at the playhead; default length 3 s in several guides (not confirmed officially); drag its edges to change length. | https://www.lilachbullock.com/how-to-freeze-frame-in-capcut/ , https://www.itechguides.com/how-to-freeze-frame-in-capcut-pc-full-guide/ , https://filmora.wondershare.com/basic-video-editing/capcut-freeze-frame.html (from search summaries; pages not opened) |

Consequences: speed UI is limited to the browser's range (below); `insertFreeze` follows the split-and-insert model; the default 3 s is a convention the lead may use, it is not enforced here. CapCut's speed curves and 0.1x..100x are NOT built (see b).

## (b) playbackRate and preservesPitch

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate : no formal range. "The audio is muted when the fast forward or slow motion is outside a useful range (for example, Gecko mutes the sound outside the range 0.25 to 4.0)." Negative = backwards, "not yet widespread". Pitch "corrected by default". The page mentions no exception for out-of-range values.
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch : Baseline widely available since December 2023; no per-browser versions or prefixes on the fetched text.
- The transport's 0.25..4 clamp is therefore the only range with a documented audible guarantee (Gecko). Chrome/Safari ranges are NOT verified (an old Chromium snapshot cited in video-research-transport.md has 0.0625..16; not confirmed current).

Decision: `SPEED_MIN = 0.25`, `SPEED_MAX = 4`, presets `0.25x 0.5x 1x 1.5x 2x 3x 4x`, plus a logarithmic slider (-2..2 on log2, so 0.5x and 2x are equally far from 1x), two decimals.

## (c) Waveform: decodeAudioData cost and limits

- https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData : returns a Promise of an AudioBuffer; "only works on complete file data, not fragments"; the result "is resampled to the AudioContext's sampling rate". MDN says nothing about memory or size limits.
- https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata (first 100000 of 399182 characters read): on failure the promise rejects with `EncodingError`; the input ArrayBuffer is detached; no memory statement.
- https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext/OfflineAudioContext : `new OfflineAudioContext(numberOfChannels, length, sampleRate)`; "All user agents are required to support a range of 8000Hz to 96000Hz".

Design (`peaksOf`): there is no streaming decode, so the whole file and the whole decoded buffer exist at once. To bound that: (1) decode in an `OfflineAudioContext(1, 1, 8000)`, the lowest rate guaranteed, so the decoded size is 64 KB per second for stereo float32 (5.5x less than 44.1 kHz); (2) reduce the buffer to `buckets` peaks one channel at a time and drop it; (3) files over `MAX_DECODE_BYTES` (150 MB) are skipped without being read, resolving to an empty array, because the decoded length is unknown before decoding and file size is the only cheap guard. 150 MB is a judgement, not a browser limit, and it is not a worst-case guarantee (a very low bitrate file could still decode large). Files with no decodable sound resolve to an empty array; `AbortSignal` rejects with an AbortError (checked before and after reading and decoding; the decode itself cannot be cancelled).

NOT VERIFIED: that the decoded channel count stays at the source's count (assumed; the reduction handles any count); decode time for long files (not measured); that `OfflineAudioContext` exists in every target browser (MDN says it is the standard constructor; no compatibility table was read).

## (d) Capturing a still frame

- https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage : "drawImage() only works correctly on an HTMLVideoElement when its readyState is greater than 1 (i.e., seek event fired after setting the currentTime property)." Which frame is drawn is not stated.
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event : fired "when a seek operation completed, the current playback position has changed, and the seeking attribute is changed to false". NOT stated: whether it fires when seeking to the position the video is already at. `freezeFrame` therefore does not wait in that case (same time, not seeking, readyState >= 2) and otherwise waits with a 5 s timeout that rejects.
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob : `toBlob(callback, type, quality)`; the callback gets `null` "if the image cannot be created for any reason"; default and fallback type `image/png`; quality 0..1 for lossy types; throws `SecurityError` if the canvas is not origin-clean (blob: object URLs from the same page are fine).

## Decision: how a freeze lives on the main track

A still is an ordinary `Clip` with `srcId` = an image Source, `start: 0`, `end: seconds`, no speed. `Clip` needs no `kind`: `schedule.ts` takes the kind from the source and reads source time 0 for images; `length(clip)` is `end - start`. Least invasive; no type change. The lead must (1) add the image Source (kind 'image', w/h of the video, blob saved as any upload) and (2) make sure trim/ripple code does not clamp a still to `source.duration` (an image has none; `trim(..., duration)` would need `Infinity` for image sources) and the compositor/pool draw an image source on the main track (schedule already emits `kind: 'image'`).

## Extract audio

`extractAudioLayer` makes an `AudioLayer` over the same video file (same `srcId`, `in` = clip start, same edit start/length/speed/volume/fades) and returns `mute: {volume: 0}` for the picture item. The file is not copied. UNVERIFIED in this repo: the pool must be able to play an AudioLayer whose `srcId` names a VIDEO source (schedule gives it `kind: 'video'`, so the pool would create a `<video>` element; the compositor only draws MediaLayers, so nothing is drawn).

## mixHeadroom

`mixHeadroom(n) = 1/n`: n sounds at full scale add to at most n, so scaling each by 1/n cannot exceed 1. Safe but quiet; a bound, not a loudness target. NOT VERIFIED: how MediaStreamAudioDestinationNode/MediaRecorder treat samples above 1 (clip or wrap). Use only if export shows clipping.
