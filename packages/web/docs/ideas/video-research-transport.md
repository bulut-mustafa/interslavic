# Transport research: what was verified, and what was not

Part A (schedule, media pool, transport). Every browser behaviour the code relies on is listed with where it was read. Anything marked NOT VERIFIED is handled defensively in code and is called out in the final report.

## Verified

| Behaviour | Source | What it says | How the code uses it |
| --- | --- | --- | --- |
| `playbackRate` has a default of 1.0; lower is slower, higher is faster; negative = backwards "not yet widespread" | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate | MDN gives no formal range. Audio "is muted when the fast forward or slow motion is outside a useful range (for example, Gecko mutes the sound outside the range 0.25 to 4.0)". | Rate is clamped to 0.25..4 (`RATE_MIN`/`RATE_MAX`), the only range MDN gives at which sound is still heard. Never negative. |
| Pitch is corrected by default | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate | "The pitch of the audio is corrected by default." | Transport still sets `preservesPitch = true` explicitly. |
| `preservesPitch` is a boolean, default true, Baseline widely available since December 2023, no prefix mentioned | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch | as quoted | Set before rate change; assignment is harmless where unsupported (an expando property). |
| `play()` returns a Promise; rejects with `NotAllowedError` when policy forbids; `NotSupportedError` for unsupported media; "other exceptions may be reported" | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play | as quoted. The page does not mention `AbortError`. | Every element `play()` is caught. `NotAllowedError` from `Transport.play()` pauses and rethrows (UI must react); everything else is swallowed so the animation loop never throws. |
| Autoplay policy: audible playback is blocked unless user interacted / muted / allowlisted; applies to script `play()`; media without audio track is not blocked; Web Audio `start()` outside user input is subject to the same rules | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay | as quoted | `Transport.play()` must be called from a click/keypress handler. Elements started later in the rAF loop are on a page that already has user activation. |
| `createMediaElementSource(el)` re-routes the element's audio into the graph; play/pause still via the element | https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource | as quoted | Only in sink (export) mode. |
| `seeked` fires when "a seek operation completed, the current playback position has changed, and `seeking` is false" | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event | as quoted | Paused `seek()` calls `onFrame` after every active element reported `seeked`. |

## Not verified (honest list)

- **Once-only `createMediaElementSource`.** The MDN page does not say a second call on one element fails. It is the Web Audio spec's rule (second call throws `InvalidStateError`) as I remember it; I did not read the spec text. The pool is built so it never needs a second call: one element per item, one source node per element, created lazily, stored on the entry, and an element is thrown away (never reused) when released.
- **Cross-origin silence** of `createMediaElementSource`: the MDN page is silent. Sources here are blob/object URLs from the same origin, so it should not arise.
- **Chromium's playbackRate range.** An old Chromium snapshot (`media/blink/webmediaplayer_impl.cc`, 61.0.3117.2, https://chromium.googlesource.com/chromium/src/+/61.0.3117.2/media/blink/webmediaplayer_impl.cc) defines `kMinRate` 0.0625 and `kMaxRate` 16.0. I could not confirm the current value or whether out-of-range throws or clamps. So the UI/clamp stays at 0.25..4. A speed beyond that (the plan says up to 100x) would need a different approach for sound and cannot be played by `playbackRate` alone with sound.
- **Whether setting `currentTime` to a position with no movement still fires `seeked`.** The HTML spec text was too long to fetch (the fetch cut off before the playbackRate/seeking prose). The code does not rely on it: a 1.5 s timeout (`SEEK_TIMEOUT`) calls `onFrame` anyway so a missed event cannot leave a stale picture, and `seek` skips elements already within one frame of the target.
- **Setting `currentTime` before metadata is loaded.** Not read. The pool defers that seek to `loadedmetadata`.
- **How many video decoders a browser allows.** No documented figure for desktop Chrome/Safari/Firefox exists. Found: Chromium's VA-API decoder (ChromeOS) caps concurrent decoders at 16, lowered to 10 for one chipset (https://chromium.googlesource.com/chromium/src/+/c74bb01a2889afdfdd1e06f0144fb7b02e2e00a2); Chromecast code restricts to 1 video decoder (https://codereview.chromium.org/239893002/ was in the search results; not opened); Bitmovin notes some devices have a single decoder (https://developer.bitmovin.com/playback/docs/understanding-single-decoder-device-limitations, from search snippet only). Limits are per platform backend and memory. **Decision:** `MAX_LIVE_VIDEOS = 4` (the plan's number) as a conservative, unmeasured default; the pool takes it as a parameter.
- **DRIFT_LIMIT = 0.15 s.** No source gives a correct figure. It is the lead's starting value. Reasoning, not citation: a seek costs a visible stall and re-buffer, so correcting at every frame (0.033 s at 30 fps) would stutter; 0.15 s is about four frames at 30 fps. It needs measuring in a real browser; it is one constant.
- **Browser behaviour in Safari/Firefox** was not tested at all (no browser run by this part).

## Design consequences

1. The clock is `performance.now`, not any element. An element that stalls does not stall the edit; it is corrected back when it catches up.
2. One element per item id; the same file used twice gets two elements.
3. Elements for items neither active nor within the lookahead window are released (pause, `removeAttribute('src')`, `load()`).
4. Per-item volume is `element.volume` in preview and a `GainNode` in sink mode.

## Review fixes

Verified while fixing review defects (fetched 2026-11-09):

| Behaviour | Source | What it says | How the code uses it |
| --- | --- | --- | --- |
| `play()` on an element that has ended playback seeks to the start | https://html.spec.whatwg.org/multipage/media.html#dom-media-play (internal play steps, step 2) | "If the playback has ended and the direction of playback is forwards, seek to the earliest possible position" | `startEl` never calls `play()` on an `ended` element; an outgoing clip whose wanted time is past the file end stays paused on its last frame. |
| At the end of the resource (forwards, no `loop`) the element sets `paused` to true and fires `ended` | same page, "reaches the end of the media resource" | as paraphrased by the fetch tool: sets `paused` true, fires `pause`, then `ended` | Explains why the element is paused when `startEl` sees it; the transport does not treat that as an element to restart. |
| `ended` is true when the media has finished playing | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended | "true if the media contained in the element has finished playing" | Guard in `startEl`. |
| `duration` is NaN with no media data, Infinity when unknown | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration | "If no media data is available, the value NaN is returned... Infinity" | `probeSource` rejects any non-finite or <= 0 length; only Infinity is sent to `resolveDuration`, and the 15 s timer runs until that resolves. |
| `loadeddata` fires when the frame at the current position has loaded, often the first frame | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loadeddata_event | as quoted | Pool `onPicture` repaints a paused picture; also `canplay` and `seeked` (names of standard events; the `canplay` page was not read), and image `load`/`error`. |

Not verified: that real browsers fire `loadeddata`/`canplay` in the order assumed (the repaint is idempotent and coalesced, so order does not matter); that `ended` becomes false immediately after a `currentTime` assignment (spec "ended playback" definition was not read; the code only skips `play()` while `ended` is true and the next frame retries); real-browser behaviour of the pinned-frame hold (jsdom fakes only).
