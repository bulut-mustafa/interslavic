# Video editor: timeline research (part C)

What the timeline code rests on. "Verified" means read on the page named; "secondhand" means a tutorial or forum, not the vendor's manual.

## Browser APIs (verified on MDN)

- **`Element.setPointerCapture(pointerId)`** - https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
  Further events of that pointer go to the capturing element even outside its bounds. Capture ends on `releasePointerCapture()` or `pointerup`. Throws `NotFoundError` for a pointer id that is not active, so the call is wrapped in try/catch. (The page does not mention `pointercancel`/`lostpointercapture` timing; I do not rely on `lostpointercapture`.)
- **`touch-action: none`** - https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
  Turns off the browser's own pan and pinch on the element (and its non-scrollable descendants), so the page gets `pointermove`/`pointerup` for the gesture instead of a `pointercancel`. Used on the lanes, the bars and the handles. A change does not affect a gesture already begun. (Page caveat: it can block zoom for low-vision users; the timeline has its own zoom buttons and slider.)
- **`pointercancel`** - https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event
  Fires when the browser decides no more events will come (the pointer is taken for pan/zoom/scroll, hardware or orientation change, accidental palm, `touch-action` blocks it, too many pointers). The page gives no handler advice; the timeline treats it as the end of the gesture, clears all drag state and sends the edit back as it was (`onChange(original, 'end')`) so nothing half-dragged is left.
- **Passive listeners and `wheel`** - https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener and https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event
  `preventDefault()` in a passive listener has no effect. `wheel` is passive by default only on Window, Document, `documentElement` and `body`; the wheel page's own zoom example registers with `{ passive: false }`. Zoom gestures (ctrl + wheel, and trackpad pinch) arrive as `wheel` with `ctrlKey` true. The timeline therefore registers its own wheel listener with `{ passive: false }` on the scroller and prevents default only when ctrl or cmd is held, so plain wheel scrolling stays native. `deltaY` is used only as a magnitude (as in the MDN example); `deltaMode` 1 (lines) is scaled by 16 (my choice, not from MDN).

## Timeline behaviour (design choices and their sources)

- **CapCut** (secondhand; the official help pages were not reachable): the main track has a "magnet" that is on by default; with it on, deleting a clip closes the gap, and clips snap to neighbours' ends and to the playhead; the magnet affects the main track only, not other tracks. Sources: https://recapio.com/digest/capcut-pc-tutorial-how-to-use-timeline-by-filip-delac , the user thread at https://www.capeditcut.com/community/video-editing/enhance-timeline-for-professional-editing-ripple-delete-across-all-tracks/ . I found no source describing CapCut's edge-drag trim in detail, so trim-handle behaviour is the common convention below, not a CapCut claim.
- **DaVinci Resolve** (Blackmagic product page, https://www.blackmagicdesign.com/ca/products/davinciresolve/edit ): in a ripple edit everything to the right is pushed along or pulled in by the clip's new duration; its manual has a "Using Snapping and Zooming" section (https://ltbits.github.io/davinci-resolve-manuals/DR11/DR11-RM-06.pdf , listed by the search, not opened in full); a toolbar zoom slider exists (https://blogs.uoregon.edu/uocinetech/?p=1566 , secondhand).
- Applied: main-track edge trim ripples (the track has no gaps, so the following clips follow); layers (overlays, text, sound) never ripple and may leave gaps; snapping is a toggle, on by default, to the playhead, 0, the end and every other item's edges, with a visible guide line; 8 px threshold (the plan's number, in screen pixels so it feels the same at every zoom); zoom by slider, buttons, Fit and ctrl/cmd + wheel keeping the moment under the cursor still.
- Premiere/HitFilm/Avid conventions from the plan (higher track in front, big trim handles) carry over; I did not open new pages for them.

## Own decisions, not taken from any source

- A press must travel 3 px before it is a drag, so a click never edits.
- Arrow keys on a focused bar move it 0.1 s; Alt+Arrow trims the end, Alt+Shift+Arrow the start; on a main clip, plain arrows reorder it one place.
- Always one free lane above the highest in use, so an item can be dragged to a new lane.

## Not verified

- Whether React 17+ registers its own `onWheel` as passive (I believe so but did not read a source); the native listener makes this moot.
- Behaviour in real browsers: all checks so far are jsdom tests; there is no layout in jsdom, so pixel positions, scrolling and real pointer capture were not exercised.

## Review fixes (waveforms, keyframe marks, handles, lane labels)

Verified on MDN:

- **`window.devicePixelRatio`** - https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio : physical pixels per CSS pixel; page zoom changes it, pinch-zoom does not; MDN's canvas recipe is a buffer of size x ratio shown at CSS size. The waveform canvas does this (ratio clamped to 1..3, read when it draws; I do not listen for ratio changes, so a window moved to another screen redraws at the next zoom or resize). I draw in device pixels instead of `ctx.scale`, since `drawPeaks` takes pixel sizes.
- **Canvas size limit** - https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement : MDN documents no maximum width/height (only defaults 300x150). Browser limits exist but are not on this page, so the 4096 device-pixel cap on the waveform canvas (stretched by CSS to the bar) is my own safe choice, not a quoted limit. Detail is lost only on bars wider than 4096 px, where 800 peaks are already coarser than a pixel.
- **`position: sticky`** - https://developer.mozilla.org/en-US/docs/Web/CSS/position : sticks relative to the nearest ancestor with a scrolling mechanism (here `.tl-scroll`, `overflow-x: auto`) and is limited by its containing block; needs an inset (`left`) to take effect. Lane labels are in-flow `position: sticky; left: 2px` children of each lane, which is as wide as the content, so they stay at the left edge while scrolling.
- Earlier pages (setPointerCapture, touch-action) cover the keyframe-diamond drag, which uses the same capture path as bar drags.

Own decisions, not from sources:

- Waveform: 800 peaks per source, decoded once per source id and kept; a bar draws `slicePeaks(peaks, in, in + span x speed, source.duration)`. Sounds fill the bar; videos and main clips get the lower 45 %.
- Diamonds: one per moment across properties (keys within `EPS` = 0.01 s are one), clamped into the bar; only the picked bar's are buttons. Arrow nudge is 0.1 s, as for bars.
- Trim handles exist on every bar and show on `:hover`, `:focus-within`, picked and dragging; unpicked bars get 8 px handles (picked 12 px) so a click near the edge still mostly picks the bar. A press on a handle picks the bar and only edits after 3 px of travel.
- Tile arrays are cached per clip id (`makeTileCache`), so the 80 ms playback re-render does not recompute them or re-render the images.

Thumbnails after adding a source: `grabStrip` and `stripTiles` are fine for a source added later. The cause of the grey block is in the editor's effect (`VideoEditor.tsx`, "Little pictures along each video"): its cleanup aborts the controller whenever `sources` or `files` changes, which stops the in-flight grab of every earlier source; the strip is then dropped (`!ctl.signal.aborted`) while `grabbed.current` still holds the id, so it is never retried. Also `s.duration ?? 0` gives `frameTimes(0, ...)` = no pictures for a source not yet measured; `grabFrames` now falls back to the loaded video's own `duration` (`usableDuration`).

Not verified: real-browser rendering (jsdom has no layout or canvas), whether `decodeAudioData` accepts the audio of every video container, hover look of the handles.
