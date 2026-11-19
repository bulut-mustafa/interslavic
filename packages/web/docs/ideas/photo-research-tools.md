# Photo tools: adjust, presets, auto, crop (research notes)

Sources actually fetched on 2026-11-09. "Not verified" says so plainly.

## Auto enhance (src/photo/auto-enhance.ts)
- Linear contrast stretch / normalisation, IN = (I - Min)/(Max - Min) * (newMax - newMin) + newMin:
  https://en.wikipedia.org/wiki/Normalization_(image_processing) (the page gives the formula; it says nothing about clipping percentiles).
- Histogram equalisation exists and is a global contrast method that "usually increases the global contrast", but can amplify noise: https://en.wikipedia.org/wiki/Histogram_equalization. Not used: too strong for a conservative one-tap button.
- Percentile clipping (1% and 99%), the target range 235, the mean-luma band 105..145, the chroma rule and the +-40 bound are THIS PROJECT'S OWN choices, not from a published standard. I could not fetch the ImageMagick page for -contrast-stretch / -auto-level (the site only returned redirects/404), so no claim is made that the method matches it.
- Luma weights 0.2126/0.7152/0.0722 (Rec. 709) are standard but were not re-fetched; the renderer's own saturate matrix uses 0.213/0.715/0.072 (W3C Filter Effects, section on saturate, fetched).
- Cost: getImageData returns an ImageData of the requested rectangle (MDN https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData). MDN's page says nothing about its cost, so the cap of 256 px per side (sampled by stride, ~65k pixels) is a precaution, not a measured figure.

## Presets (src/photo/presets.ts)
- Only fields of FxAdjust (video/effects.ts) so preview == export.
- sepia() in the W3C Filter Effects spec is a fixed matrix
  (0.393 0.769 0.189 / 0.349 0.686 0.168 / 0.272 0.534 0.131):
  https://www.w3.org/TR/filter-effects-1/#sepiaEquivalent . FxAdjust cannot express it, so "Sepia" is grey (saturation -100) plus the warmest white balance (temperature 100): a look, not the spec's matrix. No duotone / gradient map: not expressible with FxAdjust.
- Mono = saturation -100: the saturate matrix at s = 0 makes all three rows equal (0.213, 0.715, 0.072), so the channels are equal (tested).

## Crop tool (src/photo/CropTool.tsx, crop-math.ts)
- Pointer capture keeps move/up events on the dragged element outside its bounds; ends on pointerup or releasePointerCapture; throws NotFoundError for an inactive pointer (hence the try/catch for synthetic events): https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- touch-action: none on handles (MDN example uses it) so touch drags are not taken by scrolling.
- The conversions assume doc.ts order: flip, then turn clockwise, crop in ORIGINAL pixels; checked point by point in test/photo-crop-math.test.ts. Straightening is stored as an angle and does not move the box.

## UI decisions
- Google Photos' Light/Color/Pop sliders are not copied: their mapping is not published, so a guessed one would be made up. Basic sliders are exactly Brightness/Contrast/Saturation, "More adjustments" shows the rest.
- Hold-to-compare is a button with pointer and keyboard (Space/Enter held) handling; it reports onCompare(true|false).
