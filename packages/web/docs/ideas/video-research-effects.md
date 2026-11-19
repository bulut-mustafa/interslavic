# Effects research (adjust, mask, chroma key)

Code: `src/video/effects.ts`, `src/editor/EffectsPanel.tsx`. Checked 2026-11-09.

## Verified browser facts

| Fact | Source |
|---|---|
| `ctx.filter` takes the CSS filter functions (blur, brightness, contrast, hue-rotate, saturate ...); "Limited availability", not Baseline | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter |
| Safari: `filter` is `version_added: "18"` **behind a preference flag "Canvas Filters"**; Chrome 52, Firefox 49. So Safari needs the pixel fallback | MDN browser-compat-data, https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/CanvasRenderingContext2D.json |
| `ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle)`, rotation in radians; widely available. Path2D has `ellipse`, `rect`, `moveTo`, `lineTo`, `bezierCurveTo`, `closePath`, `addPath` (Safari 9+) | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse , BCD https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Path2D.json |
| `clip(path, fillRule)`, fillRule `nonzero` (default) or `evenodd`; clip persists until `restore()`, so wrap in `save()`/`restore()`; each clip intersects the previous | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip |
| `destination-in` keeps existing content only where the new shape overlaps; `destination-out` keeps it where it does not | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation |
| Shadow: sigma = half of `shadowBlur`; `shadowBlur` and `shadowOffset*` are NOT affected by the current transform; the shadow is made from the shape's alpha | HTML spec https://html.spec.whatwg.org/multipage/canvas.html (shadows section); https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur |
| Antialiasing of `clip()` edges | **not verified** (neither MDN nor the spec text I searched states it) |

### Feather technique (tested in real Chrome 155)
Draw the shape far off the canvas to the left (`translate(-off, 0)`), with `shadowOffsetX = off`, `shadowBlur = feather`, black shadow; only the blurred shadow lands on the canvas. Measured alpha across a hard edge at x=30 with feather 10: x=20 -> 7, 25 -> 45, 30 -> 131 (about 50 percent at the edge), 35 -> 210. Then `destination-in` (or `destination-out` for invert) of the content canvas with that mask. Works without `ctx.filter`, so Safari is covered. Limits: scratch canvases are the layer box size; the spec lets a browser cap sigma ("implementation-specific maximum"); not tried in Safari/Firefox.

## Filter Effects spec (https://www.w3.org/TR/filter-effects-1/ , sections 13.1 and feColorMatrix)
Fetched the HTML and read the text, not from memory.
- Filter functions "must operate in the sRGB color space" (no linearRGB).
- brightness(a): feFuncR/G/B `type=linear slope=a`.
- contrast(a): `slope=a intercept=-(0.5*a)+0.5`.
- saturate(s): matrix rows `[0.213+0.787s, 0.715-0.715s, 0.072-0.072s]`, `[0.213-0.213s, 0.715+0.285s, 0.072-0.072s]`, `[0.213-0.213s, 0.715-0.715s, 0.072+0.928s]`.
- hue-rotate(θ): `M = [0.213 0.715 0.072 ×3 rows] + cosθ·[0.787 -0.715 -0.072; -0.213 0.285 -0.072; -0.213 -0.715 0.928] + sinθ·[-0.213 -0.715 0.928; 0.143 0.140 -0.283; -0.787 0.715 0.072]`.
- Implemented as `cssFilter`, `hueMatrix`, `applyAdjustPixels`. Value mapping (our choice, matches project.ts: -100..100): brightness/contrast/saturation amount = 1 + v/100; hue degrees; blur px. Each stage is clamped to 0..255, as separate filter primitives are. Tests check the spec values (e.g. saturate(0) of red = 0.213·255 = 54). Not verified: bit-exact equality with Chrome's own rounding; expect ±1.
- Blur is not done in the pixel fallback (a pixel blur costs too much per frame): Safari without the flag shows no blur.

## Chroma key
- OBS Studio's filter (https://obsproject.com/kb/chroma-key-filter) has Similarity (default 400 of 1000) and Smoothness (80) and spill reduction. OBS's exact source was not read.
- A community shader based on OBS (https://godotshaders.com/shader/green-screen-chromakey/) converts RGB to a UV chroma plane, `U = -0.169r -0.331g +0.5b +0.5`, `V = 0.5r -0.419g -0.081b +0.5`, takes the distance to the key colour's UV, and `alpha = pow(clamp((dist - similarity) / smoothness, 0, 1), 1.5)`. **This is what `chromaKey` implements** (similarity/smoothness in 0..1 chroma-plane units; defaults 0.4 and 0.08). It is a reconstruction, not CapCut's algorithm. Spill reduction is not implemented.
- CapCut (official page https://www.capcut.com/resource/how-to-remove-green-screen-in-capcut ; "Strength", "Shadow", then feather; no numeric ranges given; sliders are called "Intensity" in some third-party guides). Our Similarity ~ Strength; Shadow (spill) is not implemented. CapCut's own algorithm is not published.

### Cost (node v23.11.1 / V8, Apple laptop, 640x360 = 230,400 px, 200 runs after warm-up; excludes getImageData/putImageData)
| pass | ms/frame |
|---|---|
| chromaKey | 2.2 |
| brightness+contrast+saturate+hue | 3.9 |
| temperature+tint+fade | 1.7 |
| sharpen | 3.1 |
| vignette | 1.6 |
Roughly 10 ns per pixel per pass, so 1920x1080 would be about 9x (chroma about 20 ms: too slow at 30 fps). Rule set in code: `CHROMA_MAX_PIXELS = 640*360`; for larger layers run the pass on a scratch canvas scaled down to at most that many pixels and draw it back scaled. Script used: scratchpad `bench.ts` (calls `chromaKey` and `applyAdjustPixels`). Browser readback cost was not measured.

## CapCut behaviour (third-party only; official help pages were not reachable for adjust and mask)
- Adjustments listed in guides: brightness, contrast, saturation, temperature, tint, highlights, shadows, fade, sharpen, vignette; sliders mostly -100..100 (https://www.capcut.com/resource/capcut-color-grading and several tutorials). Highlights/shadows are not implemented here.
- Masks: linear, mirror, circle, rectangle, heart, star; feather and invert ("invert flips which side is visible"); a mask can be moved, resized and rotated (tutorial roundups returned by search: filmora.wondershare.com/video-editing/capcut-mask.html, capcutguide.com/capcut-masking-tutorial/). We implement rect, ellipse, heart, with position/size/rotation/feather/invert; linear, mirror and star are left out.

## Own designs, not from a standard or source (labelled so)
- temperature: red gain `1 + 0.15·t/100`, blue gain `1 - 0.15·t/100`. tint: green gain `1 - 0.15·tint/100` (positive = magenta). A simple white-balance approximation; CapCut's real maths is unknown.
- fade: `c' = L·255 + c·(1 - L)`, `L = 0.25·fade/100` (lifts black).
- vignette: multiply RGB by `1 - v·smoothstep(0.3, 1, d)`, d = distance from the centre scaled so a corner is 1.
- sharpen: `c + a·(4c - left - right - up - down)`; at a=1 this is the standard 3x3 sharpen kernel [0 -1 0; -1 5 -1; 0 -1 0] (https://en.wikipedia.org/wiki/Kernel_(image_processing) ; I did not re-fetch it).
- heart: six cubic Béziers in a unit box (see `HEART`), symmetric; a drawing choice.
