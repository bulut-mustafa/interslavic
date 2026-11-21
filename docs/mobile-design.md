# Phone design

Replaces the "shrink the desktop layout" approach (docs/mobile.md rules still apply
as a floor). On a phone the app is a different layout built from different parts,
not the desktop layout made smaller. Sources: docs/ideas/mobile-research-canva.md,
mobile-research-capcut.md, mobile-research-patterns.md. Where those could not
confirm something (sheet heights, colours, spacing, motion) this document makes a
choice and says so; those are the things to tune on your phone.

## Principles (what Canva, CapCut, Lightroom, InShot etc. share)

1. **The work fills the screen.** Picture or video first, chrome minimal: a slim top bar (back, undo/redo, one primary action) and a bottom tool area.
2. **A bottom tool strip, not side panels.** Icon over a short label, scrolls sideways, 44px+ targets.
3. **The strip changes with the selection** (Canva, CapCut): nothing selected shows project tools; selecting something swaps in that thing's tools.
4. **Tools open in a bottom sheet.** Non-modal (no dimming; the canvas stays live above it), two detents (half, full) with a grabber, drag down to close, plus a visible close/Done button. One sheet at a time (Apple HIG).
5. **Touch gestures are the primary controls.** Drag to move, pinch to resize, two-finger rotate, pinch the canvas to zoom, tap empty space to deselect, long-press for more.
6. **Fewer things on screen.** A desktop button or bar can become an icon, a menu item, a sheet row or be dropped on phones. Anything needed is one tap away, not always visible.
7. **Text editing:** tap selects, tap again edits; a small toolbar rides on top of the keyboard.

## Shared parts (built once, used everywhere on phones)

| Part | What it is |
|---|---|
| `useIsPhone` | width-based (<= 40rem) switch that renders the phone components; desktop code is untouched |
| `PhoneApp` shell | 100svh grid (top bar / content / bottom bar), no body scroll, inner panels scroll with overscroll contained |
| `TabBar` | bottom navigation with safe-area padding |
| `BottomSheet` | non-modal, 2 detents, grabber (tap cycles), drag by grabber/header only via pointer capture + transform in rAF, content scrolls natively |
| `ToolStrip` | horizontal strip, scroll-snap, edge fade only on the side with more, icon + label |
| `useKeyboardInset` | `visualViewport`-driven CSS variable so bars sit above the on-screen keyboard |
| `useGestures` | two-pointer pinch/rotate/pan with a pointer Map, `gesturestart` guard for Safari, long-press timer with movement tolerance |
| `FloatingBar` | small bar next to the selected object: duplicate, delete, more |

## Screens

**Whole app.** Slim top bar (name + menu). Bottom tab bar: Translate, Learn, Phrasebook, Studio. Footer/credits move into the menu.

**Translator.** One column: big input card, language/script as a chip row, a sticky Translate button above the tab bar, result cards, tapping a word opens its card as a bottom sheet (no hover).

**Learn / Phrasebook.** Single column cards, lesson navigation as a bottom "previous / next" bar, phrasebook search sticky at top, Anki/export in the menu.

**Studio home (phone).** A Canva-style home: large tool cards (Photo, Video, Subtitles, Transcribe, Watch, Worksheets, Read aloud) and a "Your uploads" row. Opening a tool is full screen with a back arrow. No left rail on phones.

**Photo editor (Canva-like).**
- Top bar: back, undo, redo, Download (primary, right).
- Canvas fills the middle, grey surround. Pages as a thin thumbnail row under it (tap opens a page grid with add/duplicate/delete).
- Bottom strip, nothing selected: Add, Background, Crop, Adjust, Text, Layers.
- Bottom strip, something selected: Edit, Font, Size, Colour, Effects, Position, Layers, More. Floating bar on the object: Duplicate, Delete.
- Every tool opens in the half-height sheet (sliders + preset rows); the canvas shrinks above the sheet so the selection stays visible.
- Gestures on the object: drag, pinch resize, two-finger rotate; pinch on empty canvas zooms; tap empty deselects; double-tap text edits with the keyboard bar.
- Remove background, Export: full-height sheets.

**Video editor (CapCut-like).**
- Top bar: back, project/ratio, Export (right).
- Preview on top, a transport row (time, play, undo, redo, keyframe diamond), then the timeline, then the bottom toolbar.
- Timeline: centre playhead fixed, content scrolls under it; pinch zooms; overlays, text and sound as coloured bars above the main track; "+" at the end adds media; tap selects and shows trim handles; long-press reorders.
- Bottom toolbar, nothing selected: Edit, Audio, Text, Overlay, Effects, Transitions, Ratio. Clip selected: Split, Speed, Volume, Animate, Trim, Delete.
- Panels (style, effects, keyframes, speed) are half-height sheets over the lower part.

**Other Studio tools.** Subtitles: list of rows, tap a row opens an edit sheet; Worksheets: paper preview with an Edit sheet; Watch: video on top, tapped word opens a sheet; Transcribe: one big record/upload button, progress as a card; Read aloud: text + sticky play bar.

## Visual language (our choices, not from a source)

- Editors: neutral grey surround, white sheets with 16-20px top radius and a soft shadow, one teal accent (the site's), 12px labels under 24px line icons, 56px bottom strip plus safe area, 200ms transform transitions (none under reduced motion).
- Translator/Learn: the site's paper and teal, more air, larger type, 16px inputs.

## Build order

1. Shared parts + `PhoneApp` shell + tab bar + Studio home.
2. Photo phone editor.
3. Video phone editor.
4. Translator/Learn/Phrasebook and the smaller tools.
Each step is checked in jsdom; the look and the touch feel need your phone.

## Not known / to tune on a phone

Sheet detent heights, strip height, colours, long-press delay (400-500 ms and 8-10 px movement are guesses), Safari's keyboard and `visualViewport` behaviour, whether `gesturestart` stops the browser's own pinch.
