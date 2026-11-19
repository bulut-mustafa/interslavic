# On-canvas transform handles: what was verified

Written for `packages/web/src/editor/transform-math.ts` and `TransformBox.tsx`. "Verified" means the text of the page was read in this session; "not verified" is said where a claim could not be confirmed. No official CapCut page was reachable (same finding as `video-editor-research.md`).

## Figma (official help)

- https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
  - Edges change one dimension, corners both. Shift temporarily enables the aspect-ratio lock on an unlocked layer; Control temporarily disables it on a locked one.
  - Rotation: hover just outside the bounds, drag; "Hold down Shift to snap rotation values to increments of 15". Range -180 to 180.
  - Arrow keys nudge; small nudge 1, big nudge 10 (Shift + arrow).
- https://help.figma.com/hc/en-us/articles/360040450233-Arrange-objects-with-Smart-Selection and the Shape tools / vector articles (found by search): Option/Alt resizes from the centre; Shift is the proportional key; both together do both.
- Not verified: Figma's minimum size, and cursor-rotation behaviour at the handles.

## Canva

- https://www.canva.com/help/resize-and-crop/ : the Position panel has a Ratio option that keeps proportions for typed width and height. The same page says that to stretch a photo out of its ratio you enter crop mode and hold Shift while dragging a handle, which is the opposite of Figma's Shift.
- Third-party guides (not Canva) say Shift snaps rotation to 15 degrees and that a corner drag keeps proportions. NOT verified in Canva's own documentation.

## CapCut

- Only third-party pages (for example https://grandavehousing.calpoly.edu/news/capcut-pc-video-overlay-guide, https://recapio.com/digest/how-to-resize-video-in-capcut-pc-aspect-ratio-and-sizing-by-knowledgebase) were found: corner handles in the preview resize an overlay (one says proportionally), a rotation handle sits outside a corner, Scale and Rotation also exist as numbers in the basic settings. Modifier keys, snapping and minimum size: NOT verified.

## Browser pointer events (MDN, read)

- https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture : after `setPointerCapture(pointerId)` later events of that pointer go to the element until `releasePointerCapture()` or `pointerup`. Throws `NotFoundError` for an id that is not an active pointer (so the code wraps it in try/catch, which is also what lets jsdom, which has no PointerEvent, run the tests).
- https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action : by default the browser handles touch panning and pinching and sends `pointercancel` when it takes over; `touch-action: none` on the element stops that. The page warns it can block zoom for low-vision users, so it is set only on the handles and the body of the box, not on the page.
- https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event : fires when the browser takes the pointer for pan/zoom, on orientation change, a palm, too many pointers, or `touch-action` preventing the input. The page does not say capture is released afterwards (the spec is said to); the code does not rely on it and treats `pointercancel` as a cancelled drag.

## Decisions taken from this

| Input | Behaviour | Source |
|---|---|---|
| Corner drag | proportional | CapCut third-party, Canva third-party, picture convention |
| Shift on a corner | free | Canva (crop stretch) and Figma's "Shift toggles the lock" |
| Edge drag | one dimension only | Figma |
| Shift on an edge | proportional (other side grows about the unmoved axis) | Figma toggle |
| Alt/Option | resize from the centre | Figma |
| Rotate handle | turns by the angle swept about the centre; Shift snaps to 15 degrees | Figma (verified); Canva (unverified) |
| Arrow keys | 1 frame pixel, Shift 10 | Figma |
| Escape during a drag | restores the start box | common convention; no source |
| Minimum size | 8 frame pixels per side | my choice; no source |
| 24 px kept in frame | already used by `clampPosition` in `layers.ts`; applied to the box's rotated bounding rectangle when moving | existing code |

Hit areas (my own design, not taken from a product): each handle has a 24 px square hit area (36 px on `pointer: coarse`) drawn as a 10 px dot. Below 56 CSS px a side loses its middle handle; below 32 CSS px the corner handles are pushed 14 px outward so they do not pile up on the body. 24 px is not from WCAG's target-size text, which was not read.

## Geometry

Box-local axes u = (cos r, sin r), v = (-sin r, cos r). Resize converts the pointer to box-local coordinates, takes the new size on each moved axis from the fixed (opposite) side, and moves the centre by half the size change along the handle's direction, rotated back into frame space. The opposite corner/edge is therefore fixed to floating-point precision; the test sweeps 6 rotations x 8 handles x free/proportional x 4 pointers and checks it to 1e-6.
