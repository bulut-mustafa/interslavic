# Text effects: research and decisions

Code: `src/editor/text-effects.ts`, `TextEffectsPanel.tsx`, additive hooks in `text-style.ts`.

## What was verified (and where)

| Question | Answer | Source |
| --- | --- | --- |
| shadowBlur and transforms | Not a pixel count, and "not affected by the current transformation matrix": a scaled/rotated video text keeps the same blur. | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur |
| shadowBlur and sigma | sigma = shadowBlur / 2. NOT confirmed by a fetch (MDN page does not say it; the spec text I fetched was cut before the Shadows section). Written from the HTML spec; unverified here. | https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-shadowblur-dev |
| lineJoin / miterLimit | `round` fills a disc sector; default `miter` is limited by `miterLimit`. drawText already sets round + miterLimit 2. MDN does not say where strokeText puts the stroke (centred on the outline is from general knowledge, not verified). | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin |
| Composite ops | `screen`: "inverted, multiplied, inverted again"; `lighter`: "colour determined by adding colour values". | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation |
| measureText | `width` is the advance; `actualBoundingBoxLeft/Right/Ascent/Descent` are the ink box (Left positive to the left of the alignment point); ink can exceed the advance for italics. | https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics |
| ctx.letterSpacing | A CSS length string, default `0px`, invalid values ignored, part of the saved state. MDN: Baseline 2025 "newly available" (since March 2025). The per-browser version table did not load; a Safari 18.4 figure is from memory, unverified. | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/letterSpacing |
| Canva effects | The official help page returned 403 to fetch. From search snippets of it and a third-party tutorial (https://fontbundles.net/design-school/how-to-use-canva-text-effects): Shadow (direction, blur, transparency, colour), Lift (intensity only), Hollow, Splice (hollow + shadow), Echo (two trailing copies), Glitch (offset, direction, colour; fixed colour pairs), Neon (glow intensity only), Curve (slider; left = opposite direction). Gradients show fully on Shadow, Lift, Curve, Echo. The sources disagree on some parameter lists, so the parameter set below is my own decision, not a copy. Adobe Express and Photopea were not researched (no time/sources fetched). | https://www.canva.com/help/text-effects/ (snippets only) |

## Decisions

- Sizes are percentages of the font size; directions in degrees (0 = right, 90 = down). One effect per text (`TextStyle.effect`).
- hollow: `strokeText` in the text colour, no fill, width 1..12 %.
- echo: 2 or 3 copies, farthest first, fading alpha `1 - k/(count+1)` (my choice), then the normal face (keeps outline/shadow/glow). Offset 1..30 %.
- glitch: colour A copy at +offset, colour B at -offset, then the plain face. **Plain source-over, not screen/lighter**: both composite operations blend with everything already on the canvas (the photo or video frame), so on a picture they would brighten the background in the glyph shapes rather than just tint the fringe. Offset 1..15 %.
- neon: three fills with shadowColor = text colour and shadowBlur 0.15/0.4/1.0 x (0.8 x size x intensity), then a core filled 70 % toward white. Intensity 0..100.
- splice: offset outline in the second colour, then outline in the text colour, no fill (hollow letters + offset hollow shadow).
- lift: one fill with shadow `rgba(0,0,0,0.15..0.50)`, blur size x (0.12..0.47), dy size x (0.04..0.14).
- curve: arc as long as the text; `r = length / (2 pi x amount/100)`, glyph centre at arc distance s from the middle sits at angle `s / r`, position `(r sin, sign r (1 - cos))`, rotation `sign x angle`. Positive amount: arch, negative: valley. -100..100 = a full circle either way. Advances are kerned (`measure(prefix i+1) - measure(prefix i)`), letter spacing is added by hand with ctx.letterSpacing set to `0px` while measuring and drawing, so it works even where the property is missing. Results are cached (64 entries, key includes font, size, spacing, amount, whole-line width and text).
- Box: echo, glitch and splice grow the box by their reach and shift the text inside (`Layout.fx.inset`), so the layer's top-left stays put and every ink pixel is inside the box. Curve: box = extent of the rotated glyph cells (a conservative bound), each line's slot at least the line height. Glow/stroke widths are not counted, same as the existing outline and glow.
- Hollow, splice, glitch, neon, lift replace the style's outline/shadow/glow; echo and curve keep them.

## Could not verify

- ctx.letterSpacing browser versions; where strokeText centres its stroke; sigma = blur / 2 from a fetched page; Canva's exact slider ranges and Adobe Express / Photopea behaviour; the look of every effect in a real browser (only fake-context call tests and the type check were run).
- Today's drawText assigns `ctx.letterSpacing` unconditionally: where it is unsupported the assignment is a harmless expando and spacing is silently ignored (also in measuring). Only curve spaces glyphs itself.
