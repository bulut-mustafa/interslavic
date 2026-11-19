# Video editor: library, sources and persistence (part E) - what was verified

Each line is what the cited MDN page says (fetched 2026-11-09), and what the code does because of it.

## IndexedDB
- Transactions auto-end with the event loop: "If you make a transaction and return to the event loop without using it then the transaction will become inactive." Every write in `studio/idb.ts` is one request in its own transaction, resolved on `complete`; `saveSource` awaits the File before opening one. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- An unhandled request error aborts and rolls back the whole transaction ("the entire transaction is rolled back"; an `abort` event fires), so a failed write leaves the old value. The existing `run` rejects on `onerror`/`onabort`, so a quota failure reaches the caller of `saveSource`/`saveRecord`, which is how the editor says "Could not keep this video". Same page.
- Quota: "attempting to store more than an origin's quota using IndexedDB, Cache, or OPFS ... fails with a `QuotaExceededError` exception"; MDN advises try/catch and freeing space first. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria . The store does not swallow it. `removeSource` exists so the editor can free a file.
- Files are stored as Blobs: the structured clone algorithm lists `Blob` and `File` as supported types. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm . (That IndexedDB values go through structured clone is from the IndexedDB spec, not re-fetched; the existing `makeFileStore` additionally probes at run time and falls back to ArrayBuffers where a browser refuses.)
- One file per source under `video:src:<id>`, so adding or removing one source writes only that file, never the others.

## Object URLs
- `URL.revokeObjectURL`: "Call this method when you've finished using an object URL to let the browser know not to keep the reference to the file any longer." Revoking a URL that is not active "does nothing". `createSourceFiles` revokes on `remove`, on replacing an id, and on `dispose`; `probeSource` revokes its own URL in `finally`. https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static

## Reading a file's facts
- `loadedmetadata`: "The duration and dimensions of the media and tracks are now known." Used for video/audio duration and `videoWidth`/`videoHeight`. https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loadedmetadata_event
- `videoWidth`/`videoHeight` are 0 while `readyState` is `HAVE_NOTHING`; the probe reads them only after `loadedmetadata` and stores 0 as "unknown" (undefined). https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/videoWidth
- `error` fires on the media element "when the resource could not be loaded"; it does not bubble and carries no detail, so the probe listens on the element and shows its own readable message. https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/error_event
- Pictures: `naturalWidth` is the intrinsic width and "returns 0" if unavailable (no intrinsic size, or data not there), so it is read in `onload` and 0 becomes unknown (SVG without size). https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth . `HTMLImageElement.decode()` (rejects with `EncodingError`) was read but not used: `onload`/`onerror` give the size and the failure, and no decoded bitmap is needed to measure. https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode
- Videos whose duration is Infinity (recorded WebM) go through the existing `resolveDuration` (seek-far trick), not new code.
- Not used, not verified: `createImageBitmap`.

## Not verified
- The MDN pages for `loadedmetadata`, `decode` and `naturalWidth` do not say what a browser does with a corrupt file beyond the error event; the 15 s probe timeout is our own safeguard, not a documented value.
- Real browser behaviour of the new Uploads buttons (tooltip clipping by the scrolling sheet, layout at phone width) was not seen in a browser. The right-hand column opens its tooltips to the left to avoid the sheet's overflow clipping, on the reasoning that `.uploads-sheet` has `overflow-y: auto`.
- jsdom cannot load media; probing is tested through injected stand-in elements only.
