# Mobile touch-editor patterns (beyond Canva and CapCut)

Research date: 2026-11-21. Method: WebSearch and WebFetch only. Each claim carries a source tag [S#] resolved in the Sources list. Status tags: CONFIRMED (read in the source), SECONDARY (third-party or search summary only), UNCONFIRMED (could not verify, or my own synthesis), so test before relying on it.

---

## 1. Other mobile editors: layouts and what they share

| App | What the sources say | Status |
|---|---|---|
| Picsart | Redesigned editor keeps only essential navigation at the top, creative tools below as icons; to reach more tools you swipe right on the bottom options. A review site calls it a scrollable bottom bar with icons and text, and "very dense". [S1][S2] | Blog CONFIRMED (via search snippet); review SECONDARY |
| Lightroom mobile | Adobe tutorial material: tools are on the right on desktop, at the bottom on mobile. Edit is organised in panels (Light, Color, Effects, Detail), each reached through Edit then panel name. [S3][S4] | Panel names CONFIRMED; exact scroll behaviour of the bottom bar UNCONFIRMED |
| Photoshop Express | Tools split into Crop, Looks (one-tap presets, then a slider to fine-tune), Adjustments (sliders). Help pages disagree on where Blur lives (version drift). [S5] | Tool grouping CONFIRMED; bar layout UNCONFIRMED |
| Apple Photos (iOS 26) | Edit button in the bottom bar. Edit mode has tabs Adjust, Filters, Crop, Markup. Older guides: swipe left under the photo to reach per-effect buttons, then drag a slider. Crop: drag corners or pinch, aspect-ratio control, Auto button. Done saves; Cancel then Discard Changes. Dial scrub detail not found. [S6] | SECONDARY (third-party guides); dial UNCONFIRMED |
| Google Photos | Tap Edit at the bottom; tools sorted into Markup, Filters, Crop, Adjust (help page); a search box finds tools. Press reports a newer layout of Auto, Actions, Markup, Filters, Lighting, Color. Help page and press conflict. [S7][S8] | Help page CONFIRMED; redesign SECONDARY |
| Adobe Express mobile | A contextual heads-up bar on the multi-page canvas puts page actions (add, select all, duplicate, move, resize, delete) near the work. Users complained that a June 2025 black button row at the top of the canvas is heavy and takes space. [S9][S10] | Contextual HUD CONFIRMED (release notes via search); complaints are opinions |
| Instagram Stories | Drawing: brush options at the top, thickness slider on the left, colour circles at the bottom. Text editor is essentially a full-screen text field with colour and size controls. Stickers are dragged into place. [S11][S12] | SECONDARY, partly 2017 |
| InShot | Bottom toolbar of tools (Canvas, Filter, Adjust, Music, Crop, Delete, Split); Filter opens Effect, Filter, Adjust; text duration is changed by dragging its edges in the timeline. Platform differences exist (Background inside Canvas on iPhone, separate tool on Android). [S13] | SECONDARY (tutorials) |
| VN | Multi-track timeline (PiP, photos, stickers, text), 0.05 s cuts, zoom to 30x, swipe-to-delete, drag-to-reorder; a bottom toolbar exists. Reviews: no frame-step button, pause sits next to clip-jump buttons, no multi-select. [S14] | Store text SECONDARY; layout details UNCONFIRMED |
| Figma mobile | No official source found describing a mobile design mode. App Store reviews suggest creation is limited on mobile. Desktop has navigation left, toolbar bottom, properties right. [S15] | UNCONFIRMED for mobile layout, do not copy claims |

### Shared patterns (derived from the above plus HIG in section 2)
1. A horizontally scrolling tool strip at the bottom, icon plus short label, is the primary tool selector (Picsart, Lightroom, Photoshop Express, InShot). [S1][S3][S13]
2. Tool tabs open a contextual control area (slider, preset row, crop handles) in the same bottom region, not a modal over the canvas. Apple Photos, Lightroom and Google Photos all use tabs/panels for categories. [S3][S6][S7]
3. Presets and manual sliders are a pair: a "Looks/Filters" row of one-tap presets, then a slider to fine-tune. [S5][S13]
4. Canvas contextual actions (duplicate, delete, etc.) float close to the selected object (Adobe Express HUD). [S9]
5. Explicit Done and Cancel exits for edit modes; Cancel prompts to discard (Apple Photos). [S6][S16]
6. Search-for-a-tool appears once the tool count grows (Google Photos). [S7]
7. Density is the recurring complaint (Picsart "very dense", Adobe Express "heavy", "more menus more clicks"). Prefer fewer top-level tools and progressive disclosure. [S2][S10][S17]

---

## 2. Apple HIG, Material, thumb reach

### Sheets (Apple HIG) [S16] CONFIRMED (read in full)
- Modal vs nonmodal: on iOS a sheet can be either. A nonmodal sheet lets people affect the parent view without dismissing it; example: Notes uses a nonmodal sheet for text formatting on iPhone. This is the model for an editor property panel.
- Detents: two system detents, large (fully expanded) and medium (about half of fully expanded); sheets may have custom detents. Sheets support large automatically; adding medium lets it rest at both; medium-only cannot expand.
- "Consider supporting the medium detent to allow progressive disclosure." Compose-style sheets show only at full height.
- Grabber: include one in a resizable sheet; drag it to resize, tap it to cycle detents; it also works with VoiceOver.
- Dismissal: "Support swiping to dismiss"; if unsaved changes exist when swiping begins, use an action sheet to confirm.
- Buttons: Cancel on the leading edge, Done on the trailing edge. Always pair Done with Cancel (or Back). Do not show Cancel, Done and Back together.
- A resizable sheet expands when people scroll its contents or drag the grabber (scroll-to-expand handoff).
- Display one sheet at a time; for complex or prolonged flows such as photo editing, Apple suggests a full-screen modal instead of a sheet.

### Toolbars (Apple HIG) [S18] CONFIRMED
- Choose items deliberately to avoid overcrowding; prioritise only the most important items on iOS, put the rest in a More menu.
- Prefer simple recognisable symbols over text, except for actions like Edit; group by function and frequency; aim for a maximum of three groups; one primary action (Done) on the trailing side.
- Consider temporarily hiding toolbars for a distraction-free view and offer reliable ways to restore them.
- A tab bar is for navigating areas; a toolbar acts on content.

### Touch targets (Apple HIG Accessibility) [S19] CONFIRMED
- iOS default control size 44x44 pt, minimum 28x28 pt. About 12 pt padding around bezeled controls, about 24 pt around elements without a bezel. Offer alternatives to gestures (e.g. a button next to swipe-to-dismiss); avoid custom multifinger gestures for frequent actions; respect Reduce Motion (tighten springs, track gestures directly, fade instead of slide).
- WCAG 2.2 SC 2.5.8 AA: 24x24 CSS px minimum (with spacing exception); SC 2.5.5 AAA: 44x44 CSS px. [S20]

### Layout / safe area (Apple HIG) [S21] CONFIRMED
- Respect safe areas; backgrounds may extend edge to edge. The page text I fetched contains no explicit "place primary actions in the bottom" sentence, so thumb advice comes from Hoober below.

### Material [S22][S23]
- Material 1 (old, "no longer maintained") page CONFIRMED: modal sheets dim the rest of the screen (black 20% scrim), must be dismissed before interacting with content behind; persistent sheets stay visible and are part of the layout. Dismiss by swipe down, an explicit control, back button; modal also by tapping outside. Initial height should not exceed the 16:9 keyline; swipe up to fill the screen, then content scrolls internally. 48dp list items.
- Material 3 (m3.material.io) pages are client-rendered; WebFetch returned only titles. Standard vs modal, drag handle, detents, scrim in M3 are SECONDARY via search snippets (Compose docs, m3e web component: handle optional, needs an accessible label). Navigation bar 3 to 5 items is stated in the page summary only. M3 touch target 48dp: UNCONFIRMED here (fetch failed), widely quoted but not read.
- Compose `ModalBottomSheet` handles scrim, window and focus; `SheetState.show/hide`. [S23] CONFIRMED.

### Thumb reach [S24] CONFIRMED with caveat
- Hoober (2013, 1,300 observations, 780 touching): 49% one hand, 36% cradled, 15% two hands. Users change grip often. Do not put low-priority or dangerous functions in the hard-to-reach top-left; controls should work across grips.
- Caveat in the article's own comments: the reach drawings were inaccurate; people touch the centre of the screen more readily than corners and edges. Treat "bottom = easy" as a heuristic, not a measurement. Phablet owners use both hands about 70% of the time. [S25]
- Right-handed: bottom and top-right corners were least accurate in the study (search summary, SECONDARY). [S25]

---

## 3. Web implementation facts

### visualViewport and the keyboard [S26][S27][S28]
- CONFIRMED (MDN): properties offsetLeft, offsetTop, pageLeft, pageTop, width, height, scale; events resize, scroll, scrollend. Pinch-zoom shrinks only the visual viewport; the on-screen keyboard can shrink the visual viewport without affecting the layout viewport, so fixed content may be hidden behind it.
- MDN example: hide an overlay when `visualViewport.scale > 1.3`; "device-fixed" emulation by translating with `viewport.height - layoutViewport.getBoundingClientRect().height + viewport.offsetTop` and `scale(1/viewport.scale)`. MDN warns it can flicker during scroll.
- CONFIRMED (Chrome blog): iOS Safari resizes only the visual viewport; vh units keep their values with the keyboard open; `position: fixed` elements stay put and can be obscured. Chrome 108+ on Android was aligned to this. `interactive-widget` viewport key values: resizes-visual (default), resizes-content, overlays-content; Chrome-only, not Chrome on iOS. VirtualKeyboard API is Chromium-only (named, not explained there).
- Safari quirks (SECONDARY, forum and bug threads): WebKit says sticky and fixed use the layout viewport, which extends under the keyboard (expected). iOS 26.0.x reports: after the keyboard closes, visualViewport.height stays smaller than innerHeight and fixed elements stay misplaced; may vary by build. No Apple-confirmed fix found. [S29]
- Practical pattern (UNCONFIRMED, my synthesis): listen to visualViewport resize and scroll, compute `keyboard = innerHeight - visualViewport.height - visualViewport.offsetTop`, set a CSS variable, and translate the bottom bar by it. Re-run on `focusout` and after a timeout to recover from the iOS 26 stuck state.

### env(safe-area-inset-*) [S30]
- CONFIRMED: `safe-area-inset-top/right/bottom/left`; zero if the viewport is a rectangle and nothing occupies it; fallback syntax `env(name, fallback)`; `safe-area-max-inset-*` are constant maxima. Example `padding-bottom: calc(1em + env(safe-area-inset-bottom))`.
- UNCONFIRMED in the MDN page I read: that `viewport-fit=cover` is required for non-zero values. It is widely stated; verify in the viewport meta docs. Repo commit 2a97d97 already added viewport-fit and safe areas.

### svh / lvh / dvh [S31]
- CONFIRMED: svh is smallest (browser UI expanded), lvh largest (UI retracted), dvh tracks the current state and changes as bars show or hide, which can resize content during scroll and hurt performance; `vh` currently equals lvh. svh and lvh are stable.
- Pitfalls (SECONDARY): WebKit bug reports that dvh and svh match when the tab bar is hidden; iOS 26 floating bottom controls can clip fixed/sticky content; 100vh vs 100dvh gap reports. [S32]
- Guidance: use svh for stable full-screen shells, avoid animating or relayout-heavy children on dvh, test on a real iOS 26 device.

### touch-action [S33]
- CONFIRMED: none, auto, pan-x/y, pinch-zoom, manipulation (alias pan-x pan-y pinch-zoom; removes double-tap-zoom delay). Browser starting a native gesture fires `pointercancel`. Effective value is the intersection of the element and its ancestors up to the first scroller. Changing it after a gesture starts has no effect on that gesture. `none` can block low-vision zoom, so scope it to the canvas or handle only.
- Rule: set `touch-action: none` on the canvas and on drag handles; `pan-x` on the horizontal tool strip; `pan-y` on a scrolling sheet body; `manipulation` on buttons.

### Pointer events and setPointerCapture [S34][S35]
- CONFIRMED (MDN): `setPointerCapture(pointerId)` retargets subsequent events of that pointer to the element even outside its bounds; ends on `releasePointerCapture` or `pointerup`; throws NotFoundError if the pointer is not active. The MDN page does not cover implicit touch capture; the spec says touch pointers are implicitly captured to the target on pointerdown (UNCONFIRMED here, verify). Listen for `pointercancel` and `lostpointercapture` for cleanup.
- Multi-pointer: keep a `Map` keyed by `pointerId`; `pointercancel` handler must delete the entry. [S35]

### Pinch zoom with two pointers [S36]
- CONFIRMED (MDN sample): cache active pointers; when exactly 2, compute `Math.hypot(dx, dy)`; compare with the previous distance; reset prevDiff to -1 when fewer than 2 remain; `touch-action: none` on the surface. For a real editor use ratio = curDist / startDist applied to the start scale, and anchor at the midpoint (UNCONFIRMED synthesis).
- Safari: `gesturestart/gesturechange/gestureend` with `event.scale` (1.0 start) and `rotation` are WebKit-only and non-standard per MDN; call `preventDefault()` in gesturestart to stop Safari page zoom. [S37] WebKit bug reports say preventDefault does not always stop the "pinch to tab overview" gesture. [S38]
- Recommended: prefer pointer events (two-pointer) on the canvas with `touch-action: none`; add `gesturestart` preventDefault on the canvas as a safety net, and also set the viewport to block page zoom only if accessibility policy allows (UNCONFIRMED stance; zoom lock harms low vision).

### Long press [S39]
- SECONDARY: iOS Safari never fires `contextmenu` on long tap but still shows its own menu; `-webkit-touch-callout: none` reported not working on iOS 26.1; WebKit handles some long taps itself. React Aria's useLongPress cancels if the pointer leaves the target before the threshold and prevents text selection on touch.
- Pattern (UNCONFIRMED thresholds; no primary source for timing): start a timer on pointerdown, cancel on pointerup, pointercancel, or movement beyond a small tolerance; apply `user-select: none; -webkit-user-select: none` to pressable items; suppress `contextmenu` with preventDefault. Choose about 400 to 500 ms and about 8 to 10 px tolerance, then test.

### Draggable bottom sheet with detents (implementation sketch)
The sources give the behavioural spec (Apple: detents, grabber tap cycles, scroll-to-expand, swipe-dismiss, confirm on unsaved changes [S16]; Material: dismiss by swipe/control/back, scrim only for modal [S22]). The code below is my synthesis, UNCONFIRMED until tested on iOS Safari and Android Chrome.
1. Structure: a fixed container anchored at the bottom with `height: var(--sheet-full)`; move it only with `transform: translate3d(0, Ypx, 0)`; never animate `height` or `top`.
2. Detent offsets: compute Y for each detent (peek, medium, large, hidden) from the container height; keep them in state and recompute on `visualViewport` resize and orientation change.
3. Drag handle and header: `touch-action: none`; on pointerdown call `setPointerCapture`; record start Y and offset; on pointermove set `transform` directly (rAF-throttled, no React state per move); keep a short velocity window of the last about 100 ms.
4. Release: project the end position with velocity, snap to the nearest detent; below the lowest detent dismiss (and confirm if unsaved changes). Animate with a CSS transition on `transform` or the Web Animations API; shorten under `prefers-reduced-motion`.
5. Body scroll handoff: inner scroller gets `overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y`. If the sheet is not at its top detent, a drag on content moves the sheet; if at top and `scrollTop === 0` and the drag goes down, move the sheet; otherwise let it scroll. Because `touch-action` cannot be changed mid-gesture [S33], decide up front: handle drags only on the grabber/header, and let content scroll natively unless you set `touch-action: none` on content in non-top detents.
6. Non-modal mode for editors: no scrim, `pointer-events: none` on the wrapper and `auto` on the sheet, so the canvas stays interactive (Apple's nonmodal sheet example [S16]).
7. Accessibility: a grabber button with `aria-label`, tap cycles detents, plus a close button (HIG: offer alternatives to gestures [S19]).

### overscroll-behavior and rubber-band [S40][S41]
- CONFIRMED (MDN): auto, contain (no chaining, bounce may remain), none (no chaining, no bounce), chain (as described); applies only to scroll containers; an element with `overflow: hidden` is always at its boundary, so `contain` on it blocks chaining to ancestors; `html, body { overscroll-behavior: none }` removes pull-to-refresh and bounce. MDN page marks it "Limited availability"; Safari version not confirmed from the page.
- SECONDARY: older reports that `overscroll-behavior: contain` did not stop body scroll behind a modal on iOS 13; body-scroll-lock libraries note that `position: fixed` locking resets scroll position and may break since iOS 15. Chrome blog says rubber-banding is disabled "when Safari implements" it. [S41]
- Pattern (UNCONFIRMED on current iOS): for an app-shell editor, make `html, body` non-scrolling (`height: 100svh; overflow: hidden; overscroll-behavior: none`) and put scrolling only inside inner panels with `overscroll-behavior: contain`. Test whether the iOS bounce still shows on the shell; avoid body `position: fixed` hacks.

### position: sticky vs fixed on iOS [S29][S32]
- CONFIRMED (Chrome blog): fixed elements do not follow the visual viewport when the keyboard opens on iOS.
- SECONDARY: WebKit says sticky also uses the layout viewport; iOS 26 reports of fixed/sticky content not drawn below the floating browser controls and of `bottom: 0` misplacement after the keyboard closes (innerHeight not updated, fixes itself on scroll); a WebKit bug of non-empty fixed elements taller than the viewport being cropped to 100dvh.
- Guidance: for an editor, avoid page scrolling altogether; use a grid shell (`grid-template-rows: auto 1fr auto`) inside a `100svh` container so the bottom strip is in flow rather than fixed. Use fixed only for overlays, with `env(safe-area-inset-bottom)` padding, and a visualViewport-driven offset when an input inside is focused.

---

## 4. Horizontal tool strip: scroll-snap and edge fade

- CONFIRMED (MDN) [S42]: `scroll-snap-type: x mandatory | proximity`; `proximity` is the default strictness; `scroll-snap-align: start | center` on children; container re-snaps when content changes; widely available since April 2022. `scroll-padding` and `scroll-snap-align` details are not documented in the fetched page.
- Recommendation (synthesis): use `proximity` for a tool strip with many small items (mandatory can fight free flick scrolling), `scroll-snap-align: start` with `scroll-padding-inline` equal to the gutter so the first item aligns under the safe area; `scroll-snap-stop: normal`.
- Edge fade: `mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)` with the `-webkit-mask-image` duplicate. MDN: gradients are alpha masks, widely available since Dec 2023, prefixed form is harmless for older WebKit. [S43]
- Only fade the side that has more content (toggle classes from a scroll listener or IntersectionObserver sentinels); otherwise the first and last items look dimmed (synthesis, UNCONFIRMED).
- Strip CSS skeleton (synthesis):
  `.strip{display:flex;gap:4px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-padding-inline:12px;touch-action:pan-x;scrollbar-width:none}`
  `.strip::-webkit-scrollbar{display:none}` `.strip>button{flex:none;min-width:56px;min-height:56px;scroll-snap-align:start}`
- Items must still be at least 44 px tall and wide targets per HIG and WCAG AAA [S19][S20]; scroll the active tool into view with `scrollIntoView({inline:'center',block:'nearest'})`.

---

## 5. Recommended adoption list

See the reply summary. Open items needing device testing: iOS 26 keyboard/fixed behaviour, implicit pointer capture on touch, `overscroll-behavior` on the shell, long-press thresholds, M3 sheet numbers (m3.material.io unreadable by fetch).

---

## Sources
- S1 https://picsart.com/blog/meet-new-photo-editor/
- S2 https://screensdesign.com/showcase/picsart-ai-video-photo-editor
- S3 https://www.adobe.com/uk/learn/lightroom-cc/web/photo-edit-tools
- S4 https://helpx.adobe.com/lightroom-cc/how-to/lightroom-mobile-adjustments.html
- S5 https://helpx.adobe.com/photoshop-express/mobile/introduction/get-started-ios.html
- S6 https://support.apple.com/en-asia/guide/iphone/iphb08064d57/15.0/ios and https://www.popsci.com/diy/how-to-edit-photos-on-iphone
- S7 https://support.google.com/photos/answer/6128850
- S8 https://www.androidauthority.com/new-google-photos-editor-changes-3582505
- S9 https://helpx.adobe.com/express/mobile/whats-new/whats-new.html
- S10 https://community.adobe.com/t5/adobe-express-bugs/feedback-on-adobe-express-ui-update-june-2025/idc-p/15542350
- S11 https://help.instagram.com/314684928883274
- S12 https://img.ly/blog/how-to-build-instagrams-story-editor-in-a-day-23be9adff9b.md
- S13 https://techwiser.com/use-inshot-app-edit-videos-complete-tutorial/ and https://www.elegantthemes.com/blog/design/inshot-mobile-video-editing-app-an-overview-and-review
- S14 https://apps.apple.com/us/app/vn-video-editor/id1343581380
- S15 https://help.figma.com/hc/articles/23954856027159
- S16 https://developer.apple.com/design/human-interface-guidelines/sheets.md
- S17 https://community.adobe.com/questions-329/more-menus-more-clicks-slower-workflow-1224474
- S18 https://developer.apple.com/design/human-interface-guidelines/toolbars.md
- S19 https://developer.apple.com/design/human-interface-guidelines/accessibility.md
- S20 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- S21 https://developer.apple.com/design/human-interface-guidelines/layout.md
- S22 https://m1.material.io/components/bottom-sheets.html
- S23 https://developer.android.com/develop/ui/compose/components/bottom-sheets (M3 spec https://m3.material.io/components/bottom-sheets/guidelines was not readable)
- S24 http://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- S25 https://smashingmagazine.com/ebooks/touch-design-for-mobile-interfaces-ebook (via search summary)
- S26 https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- S27 https://developer.chrome.com/blog/viewport-resize-behavior
- S28 https://developer.apple.com/forums/thread/800125
- S29 https://bugs.webkit.org/show_bug.cgi?id=191204 and https://developer.apple.com/forums/thread/800798
- S30 https://developer.mozilla.org/en-US/docs/Web/CSS/env
- S31 https://developer.mozilla.org/en-US/docs/Web/CSS/length
- S32 https://bugs.webkit.org/show_bug.cgi?id=261185 and https://ishadeed.com/article/new-viewport-units/
- S33 https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- S34 https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- S35 https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events
- S36 https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
- S37 https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent
- S38 https://bugs.webkit.org/show_bug.cgi?id=233141 and https://bugs.webkit.org/show_bug.cgi?id=240892
- S39 https://lists.w3.org/Archives/Public/public-pointer-events/2024AprJun/0007.html, https://developer.apple.com/forums/thread/808606, https://react-spectrum.adobe.com/beta/react-aria/useLongPress.html
- S40 https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
- S41 https://developer.chrome.com/blog/overscroll-behavior and https://www.npmjs.com/package/body-scroll-lock
- S42 https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-type
- S43 https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image
