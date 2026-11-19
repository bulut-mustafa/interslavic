# Video compositor and export: browser API research

Checked 2026-11-09 by reading the pages named. "Verified" means the page said it; "not verified" means I could not confirm it.

## Verified

- `globalCompositeOperation` accepts `"multiply"`, `"screen"`, `"overlay"`, `"darken"`, `"lighten"` (plus others we do not use) as blend modes; default `"source-over"`. MDN marks it Baseline widely available since July 2015. https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
  The project's `Blend` type maps one to one; `normal` maps to `source-over`.
- `CanvasRenderingContext2D.filter` takes CSS filter functions: `blur(<length>)`, `brightness(<%>)`, `contrast(<%>)`, `saturate(<%>)`, `hue-rotate(<angle>)`, `"none"` resets. MDN: limited availability (not Baseline). https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter
- caniuse/MDN-BCD data: Chrome 52, Firefox 49, Edge 79 support it. Safari (desktop and iOS) 3.x to 17 do not; 18 onwards have it "Disabled by default" (a flag). https://caniuse.com/mdn-api_canvasrenderingcontext2d_filter
  Consequence: `ctx.filter` is used only when a runtime probe succeeds (assign `blur(1px)`, read it back). On Safari with the flag off the property reads back `undefined`/unchanged, so adjustments are NOT applied there. No pixel-loop fallback is implemented (documented limit: Safari shows layers without brightness/contrast/saturation/hue/blur).
- `roundRect(x, y, w, h, radii)` exists and throws RangeError for negative radii (already used by `drawText`). https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect
- `canvas.captureStream(frameRate)`: omitted = a frame whenever the canvas changes; positive = at that rate; throws SecurityError if the canvas is tainted. Baseline since January 2020. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- `MediaRecorder.isTypeSupported` is the way to choose a type; `true` does not guarantee success. `stop()` fires a final `dataavailable` then `stop`. Options include `mimeType`, `videoBitsPerSecond`. https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static and https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- `requestAnimationFrame` callbacks are paused in background tabs in most browsers. https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  Consequence: an export must keep its tab visible. The exporter drives frames from rAF and says so.

## Not verified

- Per-browser mp4/webm recording support (MDN pages gave no table; the code probes with `isTypeSupported`).
- Whether a hidden tab's MediaRecorder keeps receiving frames: only secondary sources (bug reports: Firefox bug 1344524, WebKit bug 244167) say it is unreliable. Treated as: keep the tab open and visible.
- Cost of `ctx.filter` per frame on large overlays: not measured.
- `ellipse()`, `clip()`, `getImageData` are not used by this part.
