# Photo editor: export, decode and storage research

Every rule in `packages/web/src/photo/{export,decode,store}.ts` and what it was checked against (fetched 2026-11-09).

## Canvas encoding (`exportPage`)
- `canvas.toBlob(callback, type, quality)`: `type` defaults to `image/png`, and PNG is also used if the type is unsupported; `quality` is 0..1 and applies only to lossy formats (`image/jpeg`, `image/webp`); the callback may receive `null`. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
  - Consequence in code: quality is not passed for PNG; a `null` blob is an error; the file is named for `blob.type` (a browser without WebP writing answers PNG, so the file is `.png`, never a PNG called `.webp`).
- JPEG has no alpha, so the page is filled white first (this is our rule, shown in the dialog); PNG/WebP are filled white too unless "Transparent background" is on.

## Decoding (`decodePicture`)
- `createImageBitmap(blob, { imageOrientation })`: `"from-image"` (default) applies EXIF orientation, `"none"` ignores it, `"flipY"` applies it and flips; also resizeWidth/Height/Quality. https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap  (MDN documents no exception names; the code treats any rejection as "could not be read".)
- `ImageBitmap.width/height/close()`. https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap
- Down-scaling is drawn on a canvas with `imageSmoothingQuality = 'high'`, which MDN marks as not Baseline (ignored where unsupported, so the scale then simply uses the browser default). https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality
  - Why not `resizeWidth/Height` in createImageBitmap: MDN does not say whether the size applies before or after the EXIF turn, so the full bitmap is read (after the pixel guard) and scaled explicitly.
- Header sizes (`sourceSizeOf`, no decoding): PNG IHDR width/height are 4-byte big-endian after the 8-byte signature https://www.w3.org/TR/png/ ; GIF logical screen width/height are 2 bytes little-endian at offsets 6/8 https://www.w3.org/Graphics/GIF/spec-gif89a.txt ; WebP VP8X canvas width/height minus one are uint24 LE at file offsets 24/27 https://developers.google.com/speed/webp/docs/riff_container ; VP8L header: 0x2f then 14-bit width-1 and height-1, bits read LSB-first https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification ; lossy VP8: start code 9d 01 2a then 14-bit width/height with 2 scale bits https://www.rfc-editor.org/rfc/rfc6386#section-9.1 (the RFC section does not state byte order of those two fields; code reads them little-endian as libwebp does; NOT verified here). JPEG: scan markers to the first SOFn (height then width, 2 bytes each, big-endian): from the JPEG file format (JFIF/ITU T.81), NOT re-fetched this session; covered only by a self-made test.
- HEIC/HEIF: no decoder is added. Detected by MIME (`image/heic`, `image/heif`), extension, or the `ftyp` brand in the first 12 bytes; the browser's own decode is tried first (Safari opens it); on failure a plain message tells the person what to do.
- Pixel cap `MAX_SOURCE_PIXELS = 120_000_000` is this app's own conservative choice (4 bytes/pixel RGBA while decoding = ~480 MB peak), not a platform number.

## Canvas size limits (`maxCanvasPixels`, `fitScale`)
- Chrome 268,435,456 px area (16,384 x 16,384 tested), Firefox higher and changing over time, iOS Safari 16,777,216 px (4096 x 4096); one report says iOS 18 raised it to 8192 x 8192 (single source, NOT relied on). https://jhildenbiddle.github.io/canvas-size/ ; https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ ; https://github.com/niklasvh/html2canvas/issues/3169 . A report of a far smaller macOS Safari limit (5,242,880) could not be confirmed.
- Chosen: iOS/iPadOS (UA `iPhone|iPad|iPod`, or `MacIntel` with `maxTouchPoints > 1`) 16,777,216; elsewhere 67,108,864 (8192², 256 MB RGBA); longest side 16,384. Conservative, so one big export is not what kills a tab. Scale range 0.25..4. Total canvas memory per page (iOS) is not queried: `exportPage` sets the canvas size to 0 after encoding to free it at once.

## PDF (`buildPdf`, `exportPdf`)
Checked against ISO 32000-1:2008 (the PDF 1.7 reference, a superset of 1.4 syntax; the text was extracted from https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf):
- Image XObject dictionary (Table 89): `Subtype /Image` required; `Width`, `Height` required; `ColorSpace` required (not for JPX); `BitsPerComponent` required, and a DCTDecode filter always delivers 8-bit samples (8.9.5).
- DCTDecode decodes baseline JPEG, and from PDF 1.3 progressive JPEG; components are 1, 2, 3 or 4 bytes per sample (7.4.8). Canvas JPEGs are 3-component, so `/DeviceRGB`.
- Cross-reference table (7.5.4): `nnnnnnnnnn ggggg n eol`, each entry exactly 20 bytes, eol one of `SP CR`, `SP LF`, `CR LF` (code writes `SP LF`); subsection header `first count`; object 0 free with generation 65535.
- Trailer (Table 15): `Size` = highest object number + 1 (required), `Root` indirect reference (required); then `startxref`, the byte offset of the `xref` keyword, and `%%EOF`.
- Placing an image: `q W 0 0 H x y cm /Im0 Do Q` (8.9.4 example). Page size in points = pixels * 72 / dpi (user space unit is 1/72 inch; default 72 dpi = 1 px = 1 pt).
- A comment of bytes above 127 after the header marks the file as binary (7.5.2 recommendation; present in the output).
- Tested by `test/photo-export.test.ts` with a small reader (startxref -> xref -> every offset lands on `N 0 obj`, `/Length` equals the bytes between `stream` and `endstream`, the JPEG bytes are embedded unchanged). No qpdf/pdfinfo/pdftotext on this machine; instead a throwaway Swift script with macOS PDFKit opened a 2-page sample built from a real JPEG (via `sips`): 2 pages, MediaBox 300 x 300 pt for 600 px at 144 dpi, and the page rendered to a bitmap with 15 distinct colours (the picture really draws). Not tested in Acrobat, Chrome or Firefox viewers.

## Size estimate (`estimateBytes`)
Rule-of-thumb bytes per pixel (PNG 1.2; JPEG 0.1 + 1.6 q²; WebP 0.07 + 1.13 q²). These are NOT measured or sourced; the UI says "about". Real photographs vary by several times either way.

## Storage (`store.ts`)
- Keys: `photo:meta`, `photo:page:<id>`, `photo:file:<id>`, `photo:obj:<pageId>:<fileId>`. Same design as `video/store.ts`. Old records (hist of text layers) are detected by `hist.present` being an array and upgraded with `historyFromV1`; the editor should save upgraded pages once (`SavedPage.upgraded`). IndexedDB timeouts are untouched (still `studio/idb.ts`).
