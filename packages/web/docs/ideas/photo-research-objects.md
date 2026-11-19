# Photo editor: objects, adding pictures, layers panel - browser facts checked

Each claim is from the MDN page named. Items marked NOT ON MDN were not confirmed there and must be tested in a real browser before being relied on.

## Adding pictures

- File drop (https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop): "In order for the `drop` event to fire, the element must also cancel the `dragover` event." Detect file drags with `item.kind === 'file'` on `dataTransfer.items`; read with `[...ev.dataTransfer.items].map(i => i.getAsFile()).filter(f => f)`; call `preventDefault()` in `drop`. The article also uses `<input type=file>`'s `change` event with `e.target.files`.
- `DataTransferItem.getAsFile()` (https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/getAsFile): returns the `File` if the item is a file, else `null`; during a drag it can only read in `dragstart` and `drop` handlers (any other drag event returns `null`). So do not read files in `dragover`; only check `kind`/`type`.
- Paste event (https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event): bubbles up to Document and Window, is cancelable; call `event.preventDefault()` to override default insertion; reads through `event.clipboardData`. The MDN page only documents `getData()` (text). NOT ON MDN (that page): that images come as `clipboardData.items` with `kind === 'file'` + `getAsFile()`. This is the same `DataTransferItem` interface as in drop, but verify in Chrome, Safari and Firefox with a real screenshot paste.
- Async clipboard read (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read): `navigator.clipboard.read()` resolves to `ClipboardItem[]`; rejects with `NotAllowedError` if not allowed; secure context only; "Browsers commonly support reading text, HTML, and PNG image data"; a copied JPG is read back as `image/png` (use `item.getType('image/png')`). In an iframe, Chromium needs the Permissions-Policy `clipboard-read`. MDN's text says "Baseline 2024 / Newly available" with varying support per part. NOT CONFIRMED: user-activation rules and the Firefox/Safari prompt behaviour. Decision for the lead: use the `paste` event (no permission prompt) as the primary path; offer `navigator.clipboard.read()` only behind a "Paste" button with try/catch for `NotAllowedError`.

## Pointer dragging (layers panel reorder)

- `setPointerCapture` (https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture): later events for the pointer are targeted at the capture element until `releasePointerCapture()` or `pointerup`; throws `NotFoundError` for an unknown pointerId. MDN's example sets `touch-action: none` on the dragged element; the explanation that touch panning would otherwise fire `pointercancel` is NOT stated on that page. The layers panel therefore sets `touch-action: none` only on the drag handle, and handles `pointercancel` as a cancel. jsdom has no `setPointerCapture`, so the code calls it only if present.

## Canva behaviour built against (third-party research supplied by the lead)

Position menu Top/Left/Middle/Center/Bottom/Right/Space Evenly aligned to the page; two lock variants (full / position only); Cmd+D duplicate; Cmd+G group; layers reorderable and hideable; guides snap to page edges/centre and other layers.

## Not modelled

Grouping: `PageDoc`/`PhotoLayer` has no group field, and doc.ts must not change, so group/ungroup are NOT implemented. Needs e.g. `groupId?: string` on every layer type (and TextLayer) in doc.ts.

## Emoji stickers

Stickers are TEXT layers holding an emoji character; no image is shipped. The glyph is drawn by the viewer's operating-system emoji font (Apple Color Emoji, Noto Color Emoji, Segoe UI Emoji), so the look differs by device and an exported image uses the exporter's font; no emoji artwork is bundled or redistributed by this app.
