# Photo renderer research (geometry, render, hit)

Code: `packages/web/src/photo/geometry.ts`, `render.ts`, `hit.ts`. Checked 2026-11-09. Colour maths, masks, chroma key and the Safari filter flag are recorded in `video-research-effects.md` and reused, not repeated.

## Browser facts relied on

| Fact | Source |
|---|---|
| `transform(a,b,c,d,e,f)`: a point (x,y) becomes (ax + cy + e, bx + dy + f). `Mat` in geometry.ts is exactly this, so a geometry matrix can be handed to `ctx.transform` unchanged | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform (fetched) |
| `arcTo(x1,y1,x2,y2,radius)`: tangent arc, Baseline widely available (since 2015); a negative radius throws IndexSizeError (so the radius is clamped to >= 0 and to half the box); radius 0 is a straight corner. Rounded corners use `arcTo`, not `roundRect` (newer) | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arcTo (fetched) |
| 9-argument `drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)`; throws InvalidStateError when the source has no image data or a zero width/height. So zero-size sources are skipped before drawing instead of caught. MDN does not say what a source rectangle outside the image does, so layer crops are clamped to the picture | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage (fetched) |
| Shadow offsets and blur "are not affected by the current transformation matrix"; blur sigma is half of `shadowBlur`; only the shadow colour's alpha scales the shadow; a browser may cap sigma | HTML Standard, canvas section, shadows (downloaded https://html.spec.whatwg.org/multipage/canvas.html and read the text). So shadow x, y and blur are multiplied by the canvas scale by hand, and the shadow's `opacity` is folded into an `rgba()` colour |
| "Coordinates used in the value of the current filter are interpreted such that one pixel is equivalent to ... one canvas coordinate space unit. Filter coordinates are not affected by the current transformation matrix. The current transformation matrix affects only the input to the filter." So `blur(Npx)` is in canvas pixels: when the page is drawn at scale k, blur is multiplied by k | same spec, Filters section |
| `ctx.filter` values: `none` or a CSS filter-value-list (blur, brightness, contrast, hue-rotate, saturate ...); spec lists Safari "No", Chrome 52, Firefox 49 | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter (fetched; compat table itself not on the page), spec snippet above; Safari 18 behind a flag per `video-research-effects.md` |
| `globalCompositeOperation` values for the blend modes (`multiply`, `screen`, `overlay`, `darken`, `lighten`) | already in `video/compositor.ts` `BLEND_OP` (imported) |
| Filters chain left to right in one string, so preset then adjust is `"<preset filter> <adjust filter>"` | CSS filter-value-list; applied in order (Filter Effects spec in `video-research-effects.md`) |

## Own decisions (not from a standard)

- **Geometry order.** Crop is in ORIGINAL pixels. Flip, straighten and the quarter turns all happen about the crop's centre, then the window goes to the output origin: `M = T(out/2) R(90 turns) R(straighten) S(zoom) F T(-cropCentre)`. Flip about the crop centre (not the whole picture) means toggling a flip never moves which part of the picture is cropped.
- **Straighten and size.** The crop window stays fixed; the output size is the crop (swapped for odd turns) whatever the straighten, and the picture is turned under it. Where it does not reach the corners the page background shows. `fill` zooms the picture about the crop centre by the least k at which all four window corners fall inside the picture (`fillScale`).
- **Largest inscribed crop** (aspect r = w/h, angle t, c = |cos t|, s = |sin t|): the turned window's corners stay inside W x H iff `w c + h s <= W` and `w s + h c <= H`, so `h = min(W/(r c + s), H/(r s + c))`. Tested: all four corners inside, and 0.1 percent bigger sticks out.
- **retargetLayers.** Layers are in output pixels, so a geometry change is the rigid map T = M(to) after M(from)^-1. Position through the box centre; rotation from the linear part; mirrored T toggles `flipX` and sets rotation = delta - r (L R(r) F = R(delta - r) Mx F). Tested against corner positions for every pair of 9 geometries, mirrored ones included, to 1e-6. Axis-aligned `erase` rectangles are exact only while T keeps the axes (turns, flips, crops); with straighten they are dropped and their layer ids returned.
- **Text.** Unrotated text is drawn with the same `drawText` call sequence as `renderScene` (erase rectangles first, then text); a test compares the recorded call logs. Rotated text follows `video/compositor.ts` (translate to the box centre, rotate, draw).
- **Colour cache.** The geometry-transformed, colour-adjusted base is kept in one offscreen canvas at the canvas scale, keyed by geometry, fill, the resolved preset and adjust, canvas size, picture size, picture object identity and an optional `baseVersion`. No colour edit: no cache, the base is one `drawImage` through the matrix. Preset-then-adjust order is exact when ctx.filter does all of it; when pixel extras are mixed with ctx.filter, the extras of both stages run after both stages' filter part.
- **Image-layer pixel pass** is worked on at the drawn size and at most 1920x1080 pixels (the video code's 640x360 cap is too coarse for stills); it is redone every frame, not cached.
- **Shadow on a clipped, bordered or masked picture** is drawn from a layer of its own (a kept scratch canvas), because a shadow drawn inside a clip is clipped too (own reasoning from the drawing model: shadow is part of the draw call; not tested in a browser).
- Mask content from `applyMask` is rasterised at 1 pixel per layer unit and drawn through the page scale: exact at scale 1 (export), slightly soft when the canvas is zoomed above 1.
- Heart: the six Beziers of `video/effects.ts` (copied into geometry.ts because they are not exported there). Star: regular five-point star, inner radius = (3 - sqrt 5) / 2 of the outer, stretched to the box. Arrow head: two strokes of `max(4 x width, 12)` px at 28 degrees.

## Not verified

- Nothing was run in a real browser: all tests use a recording fake context (jsdom has no canvas). Pixel results of filters, masks and shadows on a clipped layer, antialiasing of `clip()`, and Safari behaviour are untested.
- Whether `ctx.filter` reads back after assignment in every Safari build (the `supportsFilter` probe from the video code is reused).
- `TextLayer` has no `hidden`, `locked` or `name` field (only `Placed` has); hit.ts and render.ts read them from any layer, so text honours them once the field exists.
