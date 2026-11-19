# Studio and server: performance and memory audit, plan and design

Written 2026-11-08. **Decision recorded first:** transcription stays on the user's device. A server mode would upload audio, overload the free-tier instance and change the "never uploaded" promise, so it is off the table; this document works within that.

The brief was: check that everything we do is efficient in speed and memory, research the best way to do each thing, design the system properly, **and leave alone whatever is already good.** So every area below ends in a verdict: **KEEP**, **WATCH** (fine today, has a known limit) or **CHANGE** (measurably worth it).

Nothing in the product was changed for this document. It adds two measurement scripts (`npm run perf:boot`, `npm run perf:api`) and this file.

## Outcome: the plan was carried out (2026-11-08)

The sections after this one are the audit as it was written, before any change. This section is what happened next. Browser figures are from the same laptop and the same Chrome as the baseline, on the development server; the server figures use `npm run perf:boot` and a real boot.

| Plan item | Result | Before, after |
|---|---|---|
| **1. Storage never waits for good** | Done. `studio/idb.ts`: opening has a 4 s limit, reads and writes 120 s, a connection closes itself when another tab needs to upgrade or delete, and a failed open is tried afresh next time. Both editors start empty and say why instead of sitting on "Getting your pictures back…" | the permanent hang I reproduced, now covered by tests with a database that never answers |
| **2. Page lifecycle (+ item 4, no pixel copy)** | Done. Only the page on screen holds a picture (one working-size canvas, nothing else). Hidden pages keep their text and undo history. Colours are read from small regions on demand (`withRegion`) instead of from a full copy. A page added behind another gets a small thumbnail, made one at a time and let go | 6 pages: 130 MB heap + 99 MB canvases, growing with every page. **20 phone-size photos: 1 canvas (16 MB), peak heap 63 MB, 57 MB at rest.** After a reload with 6 saved pages: 52 MB heap, 1 canvas |
| **3. Audio memory** | Done. Stereo is mixed into its own first channel (no second hour-long array), samples are transferred to the worker instead of copied, and a device that reports 4 GB or less is asked for recordings of at most 30 minutes instead of 60 | one fewer full copy of the sound on the main thread and one fewer in the worker; the 30-minute low-memory limit is new |
| **5. OCR engine** | Done. `createOcrPool`: one worker, started in the background 1.5 s after the Photo tool opens (not on a connection set to save data), reused for every picture, shut down after 90 s idle, replaced after 25 pictures and when the language changes, never trusted after a failure; pictures read one at a time | a picture now reads in about **0.35 s** (4032 x 3024 photo, engine warm) against 0.64 s before. The first-ever 10 s download is moved off the critical path by design; I could not measure that without a clean browser profile |
| **6. Safari-safe files** | Done. A one-time test of whether the browser can store a File; if not, bytes and type are stored and a File is rebuilt on load | tested with a database that refuses Blobs; **not run in Safari**, which I cannot do from here |
| **7. Server index saved at build time** | Done and verified. `npm run lexicon:index` (run by the Dockerfile) saves it; the server loads it if its stamp matches the dictionary, the inflection code, the library version and the V8 format, and builds as before if not. Repeated strings and the 1,426 distinct feature sets are shared (and frozen) after loading | index **12.2 s -> 1.8 s**, **357 MB -> about 147 MB** of heap; a real boot says `743803 forms loaded in 1810ms` and listens in about 2 s; translations identical; `analyze`, `nearest` and spelling-variant lookups identical on the sample checked |
| **8. Repeated subtitle lines** | Done. A line that appears again is sent once and its answer given to every place it appears, flags and reasons included; progress still counts the file's own lines | a film's repeated "Yes." costs nothing after the first |
| **9. Split the bundle** | **Declined, with reasons.** The pages already arrive as prerendered HTML, so the 135 + 79 kB is parse time and not wait time; lazy loading would need either a visible loading flash or a second, parallel server-rendering path, and the SEO test would have to be rewritten around it. About 45-60 kB gzip for translator-only visitors does not justify that. Revisit if Lighthouse on a production build shows blocking time as the problem |
| **10. Startup CPU boost** | Documented in `DEPLOY.md` as one flag to try (`--cpu-boost`), with what to compare. Not switched on: that is a deploy, and yours to run |
| **11. Stale comment** | Fixed in `packages/server/src/main.ts` and `deploy/start.sh` |
| **Design 5.5: readout** | Done. Add `?perf=1` to any Studio address for a small box with JS heap, canvases and their size, and pages. Nothing leaves the device |

**What switching pages costs now** (20 pages, measured): the page changes in about 10 ms; a page that has been read is back with its picture and selectable text in **50-72 ms**; the first visit to a page that was never looked at takes about **0.4 s** (decode, then read). That is the price of the memory ceiling, and it is well inside the 100 ms budget for the common case.

**Still open:** the "not yet measured" list in section 8 is unchanged (long-video export, Whisper speed here, 1,500-row render, Lighthouse, Safari, Firefox, throttled CPU), and the Cloud Run cold start has not been re-measured with the saved index, because that needs a deploy.

## 1. What "good" means here

Budgets, so "fast enough" is a number and not a feeling. They are targets for a mid-range laptop and a 4 GB phone, not guarantees.

| Thing | Budget | Why this number |
|---|---|---|
| Typing, clicking, selecting | under 100 ms to the next paint | Chrome's INP "good" line is 200 ms; staying at half leaves room for slower devices ([Core Web Vitals thresholds](https://corewebvitals.io/core-web-vitals)) |
| Dragging text | every frame under 16.7 ms (60 fps) | direct manipulation must feel attached to the pointer |
| A tab's memory | under about 600 MB at the largest supported use, under 150 MB idle | a 4 GB phone gives a tab well under 1 GB before it is killed |
| First open of a heavy tool | one visible progress bar, never a frozen page | the 238 MB model download and OCR assets are unavoidable, so they must be honest |
| Server cold start | as short as the host allows; never an error | a first visitor's request is held, not failed |
| Server memory | under 50% of the 4 GiB container | the translator already peaks at about 2.1 GB |

## 2. Research digest

What the sources say, and what it means for us. Several are blogs rather than primary documentation; where a claim is only that, it is marked.

- **Canvas pixel reads are the expensive canvas call.** `getImageData` and `toDataURL` force a synchronous read-back from the GPU; the `willReadFrequently` hint makes a canvas CPU-backed and cheaper for repeated reads, but it can only be set when the context is created, and one report says it did not help ([web-features: willReadFrequently](https://web-platform-dx.github.io/web-features-explorer/features/canvas-2d-willreadfrequently), [Cesium thread](https://community.cesium.com/t/canvas2d-multiple-readback-operations-using-getimagedata-are-faster-with-the-willreadfrequently-attribute-set-to-true/20703)). *For us:* read pixels rarely and in small rectangles; measure before adding the flag.
- **A decoded image costs 4 bytes a pixel, whatever the file size** ([WHATWG thread](https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2013-December/041802.html)), and copying a bitmap into a canvas doubles it. `createImageBitmap` resizing is not reliable across browsers, so the safe downscale is a canvas draw ([pica README](https://cdn.jsdelivr.net/npm/pica@10.0.1/README.md)). *For us:* keep one working-size bitmap per document, never the full-size original.
- **OCR memory is dominated by the WASM heap, which only grows.** One oversized image leaves that worker big for life; the advice is to cap image size before OCR, keep a small fixed number of workers, reuse them, and recycle them now and then ([tesseract.js issue](https://de.github.com/naptha/tesseract.js/issues/900), [workers vs schedulers](https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/docs/workers_vs_schedulers.md)). *For us:* we already cap at 2400 px.
- **IndexedDB.** Large user files should be stored as separate records and only changed records rewritten; Blob storage works in Chrome and Firefox but older Safari (iOS especially) could not store Blobs, so ArrayBuffer plus a stored MIME type is the portable form; `navigator.storage.persist()` asks the browser not to evict ([web.dev: IndexedDB best practices](https://web.dev/indexeddb-best-practices)). *For us:* we store `File` objects directly, which is the Safari risk below.
- **Video export.** `MediaRecorder` records a canvas in real time (a one-minute edit takes a minute) but works everywhere and needs no extra code; WebCodecs can use hardware encoders and run faster than real time but hands you raw chunks that a separate MP4 muxer must package, and I found no controlled benchmark of the two ([WebCodecs overview](https://hughfenghen.github.io/posts/2023/10/06/webcodecs-new-era-for-media-on-the-web-en), [Kinetix export write-up](https://simplearyan.github.io/kinetix/blog/engineering-kinetix-export)). *For us:* not worth the added dependency until someone reports export time as the problem.
- **Video thumbnails.** The common production pattern is one reused `<video>` element, seek, draw to a small canvas, cache; seek cost is dominated by distance to the nearest keyframe, so seeking to keyframe-friendly times is the main lever ([geekyants](https://geekyants.com/blog/building-production-grade-video-thumbnail-scrubbing-in-the-browser-hls-frame-extraction-caching-and-performance-trade-offs), [Mozilla bug 971645](https://bugzilla.mozilla.org/show_bug.cgi?id=971645)). `requestVideoFrameCallback` is for frames during playback, not for scrubbing a timeline. *For us:* what we do matches the pattern.
- **Whisper in the browser.** WebGPU is reported at roughly 5-10x faster than WASM but not available everywhere (Safari not in 2026); quantisation choices differ by source and accuracy trade-offs are not benchmarked in what I found; the pipeline works in 30-second windows; blogs call in-browser Whisper practical for clips of a few minutes ([comparison](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/), [chunking guide](https://blog.openreplay.com/add-video-captions-ai-browser/)). *For us:* keep WASM as the portable path; WebGPU is an optional speed-up to try, not a rewrite.
- **React and fast pointers.** Keep per-move state out of React where possible, align work to `requestAnimationFrame`, commit once at the end of a gesture ([Nolan Lawson](https://nolanlawson.com/2019/08/11/high-performance-input-handling-on-the-web/)). *For us:* measured below; we already commit a drag as one history step.
- **Bundles.** Route-level `import()` is the standard cure for a big entry chunk, and `rollup-plugin-visualizer` is the usual first look; Vite already splits dynamic imports by default ([guide](https://frontendchecklist.io/rules/javascript/code-splitting)).
- **OffscreenCanvas** moves canvas drawing to a worker so a busy main thread cannot freeze it, but data must be handed over once as a canvas handle, not as pixels each frame ([web.dev](https://web.dev/articles/offscreen-canvas)). *For us:* only worth it if drawing becomes the bottleneck, which it is not.
- **Cloud Run cold starts.** *Startup CPU boost* gives extra CPU while the container starts (Google reports up to about 30% shorter for Node.js); *minimum instances* remove the zero-to-one cold start but cost money; lazy-loading heavy resources and deferring setup until the port is open are the standard software fixes ([Google](https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions)). Large precomputed structures are best built at image-build time and loaded, not rebuilt on every boot (my inference; no source measured it).
- **Core Web Vitals "good":** LCP 2.5 s, INP 200 ms, CLS 0.1, at the 75th percentile.

## 3. Baseline measurements

Method and honest limits: one laptop (macOS, 8 GB reported `deviceMemory`), Chrome, the Vite **development** server (unminified React, no compression), the sample inputs generated for these tests (4032 x 3024 PNGs of text, a 6-second clip). Production builds will be lighter in memory and faster to parse. Every figure is reproducible with the commands in section 7.

### Browser

| Measurement | Result |
|---|---|
| JS heap, empty Photo tool | 31 MB (55 MB on the earlier, longer-lived tab) |
| First OCR of a 2400 x 1800 image | about 10 s, nearly all of it fetching the OCR engine and language data from the CDN |
| Second OCR (engine cached) | about 0.6 s |
| Four photos read at once | all four done in 2.8 s, no memory spike beyond the final level |
| JS heap with 6 pages open | 130 MB (about 17 MB per page) |
| Canvas backing stores, 6 pages | 99 MB (16.5 MB each, outside the JS heap) |
| Drag a text layer, 60 pointer moves, 6 pages open | p50 16.6 ms, p95 17.6 ms, none over 20 ms (the layer demonstrably moved) |
| Select all text, click to toolbar | 132 ms (includes matching four lines to fonts) |
| `getImageData` of 2400 x 1800 | 8-13 ms |
| Thumbnail (draw + JPEG) | 0.6 ms |
| PNG encode of 2400 x 1800 | 11 ms on a plain canvas (a real photo costs more) |
| Saved data, 6 small pages | 4.5 MB of a 10 GB quota; each page record about 10 KB; `persisted()` was **false** |
| Production bundle | one 458 kB script (146 kB gzip) plus 62 kB CSS (11 kB gzip); a 554 kB Whisper worker loaded only for captions |

What is in the 233 kB of our own minified code (React itself is another 205 kB): lessons 79 kB, video 27, photo 25, editor 19, studio shell 12, subtitles 11, transcribe 10, player 10, worksheets 8. The Studio tools together are about 135 kB of the 233, and the lesson text about 79 kB; **both are downloaded by someone who only wants the translator.**

### Server

| Measurement | Result |
|---|---|
| Dictionary load | 375-413 ms |
| Full-form index build | **12.2-12.9 s**, +357 MB of heap (532 MB total process) |
| What the index holds | 19,361 entries, 743,803 distinct forms, 1,277,689 generated |
| Lookups once built | 120,000 `has()` in 7-12 ms |
| Translate, 1 / 5 / 20 / 50 lines | 44 / 254 / 1,025 / 2,567 ms: **about 51 ms per line, flat** |
| A 1,500-line subtitle file | about 77 s of server time at that rate |
| Analyse 20 sentences | 55 ms |
| Health check | 5 ms |
| Cloud Run (earlier, recorded in `deploy/start.sh` and `DEPLOY.md`, before Ukrainian was added) | language models about 22 s and the index about 33 s, run in parallel, so boot waits for the index; a cold API start measured about 40 s; 2.1 GB peak of 4 GiB |

A stale comment: `packages/server/src/main.ts` says the index is 286k forms and takes about 2.8 s; it is now 744k forms and 12 s.

## 4. Verdicts, area by area

### Photo editor
| Part | Verdict | Evidence and reasoning |
|---|---|---|
| Working-size cap (2400 px) | **KEEP** | matches the OCR research; keeps WASM heap bounded |
| Full redraw on every change | **KEEP** | draw cost is negligible; dragging holds 60 fps with six pages open. OffscreenCanvas would add complexity for no gain |
| React re-render per pointer move during a drag | **KEEP** | measured: no frame over 20 ms. Revisit only if low-end devices disagree (test with CPU throttling) |
| Selection, overlay, font matching | **KEEP** | 132 ms for the heaviest case |
| Per-page memory | **CHANGE (P0)** | each page keeps a full-size canvas, an `ImageData` copy of the whole picture (about 17 MB), and the decoded original (up to about 48 MB for a 12-megapixel photo). Worst case about 80 MB a page, so 20 phone photos is roughly 1.6 GB: a tab crash on a 4 GB device. Hidden pages do not need any of it |
| `ImageData` kept for the page's lifetime | **CHANGE (P1)** | used only to sample colour and weight around a selection; sample those small rectangles on demand instead |
| OCR worker created and destroyed for every picture | **WATCH** | costs about 0.3-0.6 s a picture (a repeat takes 0.6 s in total); the real cost is the first run's 10 s of downloading |
| First-run OCR wait | **CHANGE (P1)** | warm the engine in the background when the Photo tool opens, so the wait overlaps with the user choosing a picture |
| Saving as PNG | **KEEP** | 11 ms+, runs on demand |

### Pages and kept work (IndexedDB)
| Part | Verdict | Evidence |
|---|---|---|
| Storing each picture once and a small record per page | **KEEP** | matches the "separate records, rewrite only what changed" guidance; records are about 10 KB |
| Opening the database has no timeout | **CHANGE (P0)** | **reproduced:** with a delete request pending, `indexedDB.open` never answered and the editor sat on "Getting your pictures back…" for good. The same happens if a future version upgrade is blocked by an old tab. Needs a timeout, `onblocked`, and `onversionchange` closing the old connection |
| Storing `File` objects directly | **CHANGE (P1)** | fine in Chrome and Firefox, a known failure on older Safari/iOS. Probe once at first save, and fall back to ArrayBuffer plus a stored type |
| `persist()` | **WATCH** | requested, but Chrome returned `false`. Eviction under disk pressure is possible; loading already copes with missing data |
| Save debounce (250-500 ms) | **KEEP** | cheap; failures are shown |

### Video editor
| Part | Verdict | Evidence |
|---|---|---|
| Preview by hopping one `<video>` between clips (no copying) | **KEEP** | the right design: zero extra memory |
| Thumbnails from a second hidden video, 8-30 frames, 112 px | **KEEP** | matches the production pattern; small. **Measure** on a long video: seek cost grows with keyframe distance |
| Export with `MediaRecorder` | **KEEP** | real time, but universal and dependency-free. Switch to WebCodecs only if export time becomes the complaint |
| Keeping a whole video in IndexedDB | **WATCH** | works, quota is large (10 GB here), failures are shown; large files make saves slow. Measure a 500 MB file |

### Recording and captions
| Part | Verdict | Evidence |
|---|---|---|
| Whisper in a worker, model cached by the browser | **KEEP** | the decision above; the 30-second windowing is the standard pipeline |
| Decoding the whole file at once | **CHANGE (P0)** | the file is read into memory (up to 200 MB), decoded to float samples (about 230 MB a channel for an hour at 16 kHz), mixed to a second mono copy, then copied again to the worker: roughly 1 GB at the 60-minute limit. Release the file buffer straight after decoding, transfer rather than copy to the worker, and warn on long files |
| 60-minute limit | **WATCH** | in-browser Whisper is described as practical for minutes, not hours; the limit is generous. Lower it on devices reporting little memory |
| WASM only | **WATCH** | WebGPU could be several times faster where available; try it as an optional backend, measure real-time factor before committing |

### Subtitles, Watch, Worksheets
| Part | Verdict | Evidence |
|---|---|---|
| Rendering up to 1,500 editable rows | **KEEP** | rows use `content-visibility: auto`. **Measure** the render time of 1,500 rows once |
| Translating in batches, one at a time | **KEEP** | the server is single-CPU and serialised; parallel requests would not help. 51 ms a line is flat |
| Repeated identical lines | **CHANGE (P2)** | a film repeats "Yes." and "What?" many times; translating each distinct line once is free speed |
| Watch: one video element, analysis cached per line | **KEEP** | already cached; 55 ms for 20 sentences |
| Worksheets: pure function and print stylesheet | **KEEP** | nothing heavy |

### Shell and delivery
| Part | Verdict | Evidence |
|---|---|---|
| Studio tools and lesson text in the entry bundle | **CHANGE (P2)** | about 135 + 79 kB minified (roughly 45-60 kB gzip) downloaded by translator-only visitors. Split with `import()` at the tool and lesson boundaries. Caveat: the site is prerendered for search engines, so each lazy boundary needs a server-render path and the SEO test must keep passing |
| Hashed assets cached long, pages no-cache | **KEEP** | already how `deploy/hosting.py` is set up |
| All visited tools stay mounted | **WATCH** | intentional (keeps work); it is the reason memory grows. The page lifecycle below makes it cheap |

### Server
| Part | Verdict | Evidence |
|---|---|---|
| Rebuilding the full-form index on every boot | **CHANGE (P1)** | 12 s here, about 33 s on Cloud Run (the slower of the two things boot waits for), +357 MB of heap, identical every time. Build it once at image-build time and load it. Expected: a few seconds to load and a smaller heap, which moves the cold-start floor to the parser's models (about 22 s, run in parallel), so the gain is real but capped there |
| Parser: three Stanza pipelines loaded at boot | **WATCH** | memory is 1.2 GB of the 2.1 GB peak; loading languages lazily on first use would cut cold start and memory but moves the delay to the first request in that language |
| Startup CPU boost | **CHANGE (P2, one flag)** | Google reports up to about 30% shorter Node starts; cheap to try and measure |
| Minimum instances | **NOT NOW** | removes cold starts but costs money; wrong for a free tier |
| Per-request work | **KEEP** | 5 ms health, 55 ms analyse, 51 ms a translated line |

## 5. System design

The one structural idea that fixes most of the memory findings, and costs nothing where things are already fine.

### 5.1 Document lifecycle: active, warm, cold

Every open document (a Photo page, the Video project) is in exactly one state.

| State | What is in memory | What it costs | When |
|---|---|---|---|
| **Active** | working bitmap, canvas, layers, undo history | about 20-40 MB (17 MB canvas + the history) | the page on screen |
| **Warm** | layers, undo history, small thumbnail, the compressed `File` | well under 1 MB | every other page, as soon as it is hidden |
| **Cold** | nothing but its saved record | zero | restored from the database on demand (also how a reload works) |

Switching pages: warm to active means decoding the saved picture at working size (about 50-150 ms for a 12-megapixel photo), re-attaching the layers and drawing. That is the same path as restoring after a reload, so it is already tested. A budget of **one active page, up to N warm pages** gives a memory ceiling that no longer scales with the number of pages: N pages cost N x ~1 MB, not N x ~80 MB.

The components already separate state from drawing (layers are plain data), so the change is to unmount the canvas and release `ImageData` for hidden pages while keeping their React state alive, not a rewrite.

### 5.2 Resource ownership

- **One OCR worker**, started when the Photo tool first opens (idle priority), reused for every picture, terminated after a minute of idleness or after an unusually large image (the research's "reuse, but recycle"). One worker, not a pool: on one machine OCR is CPU-bound and four at once gave no benefit worth their memory.
- **One Whisper worker** per transcription, created on demand, disposed when done or cancelled (already so).
- **One hidden `<video>` for thumbnails**, reused, released after the strip is built (already so).
- **Large buffers have one owner.** Audio: file bytes are released as soon as decoding finishes; samples are transferred to the worker rather than copied.

### 5.3 Caches, from fastest to slowest

1. In memory: decoded working bitmap (active page only); look-ups already cached per subtitle line in Watch.
2. The browser's HTTP cache: hashed JS/CSS (long-lived), OCR and Whisper assets from the CDNs.
3. IndexedDB: pictures, page records, video project; **always treated as possibly missing** (eviction), always with a timeout.
4. Server: the full-form index, built once at image build.

### 5.4 Resilience rules for anything stored

- Opening the database: timeout (about 4 s), handle `onblocked`, close on `onversionchange`. On failure, start empty and say so; never wait forever.
- First save probes whether this browser can store a `File`; if not, use bytes plus a stored type.
- Every write failure is visible (already so for quota).

### 5.5 Telemetry-free measurement

No analytics on performance (the product's promise). Instead, a developer-only switch (`?perf=1`) that draws a small overlay: JS heap, active/warm page counts, last OCR time, last frame time. Plus the repeatable scripts in section 7. Budgets from section 1 are asserted in CI where they can be (bundle size, memory-per-page arithmetic in unit tests).

## 6. Plan, in order

Each item says why, how to know it worked, and what could go wrong. Nothing here is a rewrite.

**P0 - correctness and crash risks (small, do first)**
1. **IndexedDB timeout and blocked handling.** Shared helper in `studio/idb.ts`, used by both stores. *Verify:* a unit test where `open` never answers; the editor must show its empty start within the timeout. *Risk:* none beyond a spurious empty start on a very slow disk; show "could not read saved work" rather than hiding it.
2. **Page lifecycle (5.1) for Photo.** Release the canvas and `ImageData` of hidden pages; rebuild on show. *Verify:* open 20 phone-size photos; JS heap and canvas memory flat after the 21st; switching under 200 ms; undo history intact. *Risk:* a visible flash on switch, so keep the last frame as a thumbnail until the canvas is back.
3. **Audio decode memory.** Free the file buffer after decode; transfer samples to the worker; clearer message and lower limit on low-memory devices. *Verify:* peak memory when transcribing a long file (measure with the browser's task manager and the section 7 script).

**P1 - clear wins**
4. **Sample colours on demand** instead of holding the page's `ImageData` (saves about 17 MB a page; folds into item 2).
5. **Warm the OCR engine in the background** when Photo opens and reuse one worker. *Verify:* first-picture time drops from about 10 s towards the 0.6 s repeat time once the user has spent a few seconds choosing a picture.
6. **Safari-safe storage probe** for `File`. *Verify:* needs a Safari or WebKit run, which I cannot do from here.
7. **Server index precomputed at image build.** Serialise the index in the Docker build; load it at boot. Prototype first: measure load time and heap against the 12 s and 357 MB above. The index is the slower side of boot (about 33 s against about 22 s for the models on Cloud Run), so this is where a cold start can actually shrink; after it, the parser's models set the floor. *Risk:* index format becomes a build artefact that must match the dictionary snapshot; guard with a version stamp and fall back to building.

**P2 - nice to have, measure first**
8. Translate each distinct subtitle line once per file.
9. Lazy-load Studio tools and lesson text (watch the prerender and the SEO test).
10. Cloud Run startup CPU boost; measure cold start before and after.
11. Fix the stale boot comment in `main.ts`.

**Do not do (already good, or not worth it)**
- OffscreenCanvas, dirty-rectangle redraw or a layered canvas: drawing is nowhere near the bottleneck.
- WebCodecs export: only if export time is reported as a problem.
- A server transcription mode: decided against.
- Min-instances: costs money.
- Parallel translation requests: the server is serial on one CPU.
- Rewriting the drag path to bypass React: 60 fps held.

## 7. Measuring it again

```
npm run perf:boot     # server boot time and memory, with GC exposed
npm run perf:api      # translate and analyse latency (needs npm run server and the parser)
```

Browser numbers: run the app (`npm run web`), open DevTools, and use the snippets below in the console.

```js
// JS heap right now, in MB (Chrome only; it excludes canvas and decoded-image memory)
Math.round(performance.memory.usedJSHeapSize / 1048576)

// canvas memory held by the open Photo pages, estimate in MB
[...document.querySelectorAll('.layer-canvas')].reduce((n, c) => n + c.width * c.height * 4, 0) / 1048576

// storage used and whether the browser promised to keep it
await navigator.storage.estimate(); await navigator.storage.persisted()
```

For true tab memory use Chrome's task manager (Shift+Esc) and the Memory panel's heap snapshot; for first-load numbers run Lighthouse on a **production** build (`npm run web:build`, then serve `packages/web/dist`).

## 8. Not yet measured, and assumptions

- All browser figures are from the development server on one laptop; low-end phones are untested. CPU-throttled runs (DevTools, 4x or 6x slowdown) should be done before closing any "KEEP" in the drag path.
- Not measured: video export time and memory on a long video, thumbnail generation on a long video, Whisper real-time factor on this machine, 1,500-row render time in Subtitles, Lighthouse scores, Safari and Firefox.
- The per-page memory ceiling (about 80 MB) is arithmetic from pixel counts and one measured canvas figure, not a measured total; decoded-image memory is not visible to `performance.memory`.
- The Cloud Run numbers are the ones already recorded in the repository, not re-measured.
- The research is mostly blog-level; where a claim could not be confirmed against primary documentation it is labelled as such above.
