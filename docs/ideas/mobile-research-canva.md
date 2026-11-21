# Canva mobile editor: layout and interaction research

Research only (WebSearch/WebFetch). Canva's own help center (canva.com/help/*) and newsroom returned HTTP 403 to fetch, so most detail comes from search-result snippets of those pages plus third-party tutorials. Tags: [C] = confirmed by a cited source, [3P] = third-party/older tutorial (may be outdated), [?] = not confirmed, treat as assumption.

## 1. Screen anatomy

- Home navigation: five tabs at the bottom, Canva AI first; Recent designs moved to Your Designs; profile and Print Cart under More. Rollout gradual, old nav cannot be restored. [C] S1. French page also lists a Brand tab [3P-snippet] S1. Exact five tab names: [?].
- Older home/create: search box for templates, "Create a design" section with preset sizes (worksheets, social, logos, flyers), "Your designs" list; a purple button creates a design and, inside the editor, the same purple "+" opens elements/templates. [3P] S5, S6. Current app may differ.
- Editor top bar: Undo/Redo top-left as round arrows; download (down arrow) and share (up arrow) at top; "..." for file options (rename); resize for Pro; save status icon. [3P] S6, S7. Mode switching via "More" icon in header. [3P] S4.
- Canvas: design page in the middle; tap background to deselect. [3P] S6. Background selection shows purple outline with a top menu: comment, duplicate, delete. [3P] S5.
- Bottom toolbar (no selection): a scrollable panel mirroring desktop's left panel: Design, Elements (graphics, photos, videos, stickers, audio, AI image), Text, Camera, Uploads, Draw, Projects, Apps. [3P] S5 (older layout; the order and set are not verified against the current app).
- Pages: thumbnail view of all pages with add-page; pinching the editor screen toggles it. [3P] S5. In scrolling view pages scroll horizontally on mobile. [C-snippet] S8. Page menu: add blank, duplicate, delete. [3P] S6. Reorder by long-press drag on phone: [?] (help only documents drag in thumbnail/grid view, S8).
- Redesigned editor ("glow up"): light theme, floating object panel, toolbar suggests relevant options for the selected element. [C] S2, S3 (desktop-focused article; the mobile help snippet says the same).

## 2. Tapping an element

- Selection changes the bottom panel into a contextual toolbar for that element type; purple outline around the element. [3P] S5; S4 says toolbar runs along the bottom edge under the design and appears after tapping an element. [3P]
- Toolbar is horizontally scrollable ("swipe left to see more"); overflow goes to a "More" icon; long-press an element or More on the floating toolbar gives duplicate/delete/etc. [C-snippet] S3, [3P] S4.
- Image tools: Replace (gallery/camera/Canva stock), Effects, filters, crop, flip, animation, Magic Studio (bg remover). [3P] S5, S7.
- Nudge control (arrows, ~1 px per tap) at the end of the toolbar. [3P] S5, S7.
- Handles: drag corners to resize, sides to crop (images), rotate handle. [3P] S5, S6. Text: tap purple line selects the box; tap inside enters editing; double-tap element edits text. [3P] S5, S6.
- Text editing: keyboard opens with its own toolbar above it (font, colour, size); swipe left for more, up-arrow expands it, a close button returns to the editor toolbar. [3P] S4. Formatting in the bottom panel: font, size slider, bold/italic/underline/strike, case, alignment, lists, line/letter spacing (slider or typed number), Effects (shadow, hollow), curved text, opacity, animation; "..." copies style. [3P] S5. Colour opens from a colour tile in the toolbar. [3P] S9.
- Picker presentation (bottom sheet vs panel replacement, heights, tabs, drag-to-dismiss): [?] not described in any source found. S5 says the bottom panel "switches" to the options, suggesting in-place replacement of the toolbar rather than a modal sheet; this is inference.

## 3. Gestures

- Drag to move; app helps centre objects or align to other objects (snapping/guides exist, visual style [?]). [3P] S7.
- Tap-hold starts multi-select, then an add-to-selection button; group/ungroup button. [3P] S6. Overlapping elements can be selected together via Layers. [3P] S5.
- Pinch the editor to toggle page thumbnails [3P] S5. Pinch-to-zoom canvas exists as an official feature ("take a closer look at details"). [C-snippet] S10. Two-finger pan, rotate-by-two-fingers, double-tap zoom: [?].
- Undo/redo top-left. [3P] S6, S7. Offline editing: Android and mobile browsers only. [3P] S4. "/" quick actions not on mobile. [3P] S4.

## 4. Add / Position / Layers / Crop / Adjust / Remover

- Add: bottom-panel tabs (see 1) or purple "+" button. Elements tab includes graphics, photos, videos, stickers, audio. Uploads reads phone files; Camera tab shoots directly. [3P] S5, S6. Flow inside tabs (search field, categories, tap to add vs drag): [?].
- Position: forward/backward, to back; centre/middle align; Advanced: rotate by degrees, X/Y in px, lock aspect ratio. [3P] S5. Layers panel: drag to reorder stacking. [3P] S5.
- Crop: drag corners (resize) and sides (crop); crop and flip in image menu; undo/redo reverse. [3P] S5.
- Adjust: image Effects tab has shadows, blur, face retouching; Adjust (brightness etc.) and filters mentioned by listing/tutorials. [3P] S5, S7; S11 lists lighting and contrast adjustments, filters, collages.
- Background remover: Magic Studio in the image menu, one tap, Pro. [3P] S5; App Store lists background removal. [C] S11.
- Opacity: "transparency" control in the selected-element section. [3P] S9.

## 5. Visual style

Confirmed: purple selection outline [3P] S5; purple primary create button [3P] S6; light-themed floating panel (redesign) [C] S2; toolbar is icon-driven and horizontally swipeable [C-snippet] S3. Spacing, button sizes, icon-over-label, motion, sheet radius/height: [?] none found in text sources; verify with screenshots.

## 6. Left out on mobile vs desktop

- Quick-actions search "/" absent. [3P] S4
- Offline editing not on iOS/iPad. [3P] S4
- Page reorder multi-select documented only with Ctrl/Cmd on desktop. [C-snippet] S8
- Everything else (keyboard shortcuts, rulers, side-by-side panels, full effect sets): [?] not documented; inference only.

## Gaps

Official help pages blocked; no source for picker sheet geometry, snapping visuals, motion, exact button sizes, or two-finger rotate. Next step: App Store/Play screenshots viewed manually or YouTube screen recordings.

## Sources

- S1 https://www.canva.com/help/navigate-canva-mobile-app/ (search snippet only, fetch 403)
- S2 https://www.canva.com/newsroom/news/glow-up/ (snippet only)
- S3 https://www.canva.com/help/glow-up/ (snippet only)
- S4 https://femaleswitch.app/startup-playbook-post/where-is-the-editor-toolbar-in-canva
- S5 https://lilys.ai/en/notes/how-to-use-canva-20251025/how-to-use-canva-app-mobile-tutorial (readray.ai mirror)
- S6 https://lilys.ai/en/notes/how-to-use-canva-20251025/use-canva-templates-mobile (readray.ai mirror)
- S7 https://www.makeuseof.com/how-to-use-canva-beginners-guide/
- S8 https://www.canva.com/help/manage-pages/ (snippet only)
- S9 https://nancybadillo.com/how-to-add-text-in-canva-tutorial-for-beginners/ (snippet only)
- S10 https://www.canva.com/design-school/resources/pinch-to-zoom (snippet only)
- S11 https://apps.apple.com/us/app/-/id897446215
- Also: https://readray.ai/en/notes/how-to-use-canva-20251025/canva-tutorial-mobile-app-graphics (garbled transcript; home search/templates, text/opacity/layers basics)
