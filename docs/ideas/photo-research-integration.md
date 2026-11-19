# Photo editor integration: what was checked

Checked on MDN (fetched 2026-11-09):

- Paste: `paste` "bubbles up the DOM tree, eventually to Document and Window, is cancelable". The editor listens on `window` and calls `preventDefault` only when it handles the paste. https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event
- Pasted files are read from `ClipboardEvent.clipboardData` (stated on the DataTransfer.files page); dropped files from `dataTransfer.files` in the `drop` handler (only readable there and in `dragstart`). https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files
- `ImageBitmap.close()` "disposes of all graphical resources"; width and height read 0 afterwards. Used when a layer picture is released (a canvas is emptied with width = 0 instead). https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close
- `inert` makes the browser ignore user input events, including focus, for the element: used on the editing surface while a file is being made (same as the video editor). https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert

Not confirmed by the pages fetched (standard behaviour, relied on, not verified here): that Cmd+V / Ctrl+V fires `paste` (the page says only "a paste action through the browser's user interface"); that `getData('text/plain')` is the canonical type string; that `dragover` must be cancelled for `drop` to fire. `navigator.clipboard.writeText` can be refused (permission, insecure context): the editor therefore also keeps the copied layers (and their files) in memory for the tab, which is what a later paste uses when the clipboard holds no payload.

Decisions:

- Live Text is switched off, with a visible hint and a reset button, while the picture is cropped, turned, flipped or straightened (OCR boxes belong to the original pixels).
- Snapping while resizing with the transform box infers the handle from which edges moved (upright boxes only); Alt switches snapping off.
- Layer pictures are decoded for the page on screen only and released with it; files are kept next to the page in the store (not deleted when a layer is removed, so undo can bring it back).
- Page sizes for pages never shown this visit in the download window are read from the file header and are estimates until the page has been shown.
