# Phone parts (packages/web/src/phone)

Shared parts for the phone layout in docs/mobile-design.md. All CSS is plain, classes are prefixed `ph-`, motion is transform/opacity only and off under reduced motion. Pure math lives in files without React so it is unit-tested (`gestureMath.ts`, `sheetMath.ts`, `placeBar` in FloatingBar).

**`useIsPhone()` / `isPhoneNow()`** (`useIsPhone.ts`). `matchMedia('(max-width: 40rem)')` through `useSyncExternalStore`; the server snapshot is `false`, so the prerender is the desktop page and there is no hydration mismatch. `isPhoneNow()` reads it once (false without a window or matchMedia).

**`<BottomSheet>`** (`BottomSheet.tsx`). Props: `open`, `onClose`, `title`, `detents` (default `['half','full']`: 45% and 85% of the viewport height; a number is a percent), `initialDetent` (index, shortest first), `headerAction` (replaces the close button, e.g. Done), `dismissible` (default true), `onHeight(px)`, `heightTarget` (element that gets `--sheet-h`, default `<html>`). Non-modal, no scrim. Drag the grabber or header (velocity-aware snap, drag below the lowest detent dismisses); tap the grabber to cycle; Escape closes. `onClose` is only a request: the parent sets `open` false. Render ONE sheet per screen and change its title/children for another tool. Size the canvas with `height: calc(100% - var(--sheet-h, 0px))` or `onHeight`; the variable is set when the sheet settles, not during a drag.

**`<ToolStrip>`** (`ToolStrip.tsx`). Props: `items` (`{id,label,icon,disabled?,badge?}`), `selected`, `onSelect(id)`, `mode`, `label`. Icon over a 12px label, 56px targets, scroll-snap proximity, `touch-action: pan-x`, edge fade only on the side with more. Change `mode` together with `items` when the selection changes; the new strip slides and fades in.

**`useKeyboardInset(target?)` and `<KeyboardBar>`** (`useKeyboardInset.ts`, `KeyboardBar.tsx`). The hook returns the keyboard height in px (from `visualViewport` resize and scroll, re-measured on `focusout`) and sets `--kb` on `<html>` or `target`; insets under 80px and pinch-zoom count as 0. `measureInset()` is the plain function. `<KeyboardBar forceShow?>` shows its children fixed just above the keyboard, only while it is up. Mount one per screen.

**`useGestures(ref, handlers, enabled?)`** (`useGestures.ts`). Callbacks only: `onTap`, `onDoubleTap` (after a second `onTap`; 300 ms, 30 px), `onLongPress` (450 ms, cancelled by more than 10 px of movement; the rest of that touch is ignored), `onDragStart/onDrag/onDragEnd` (`x,y,dx,dy,stepX,stepY`), `onTransformStart/onTransform/onTransformEnd` (`cx,cy,scale,rotation (deg),dx,dy` for two fingers). Coordinates are in the element's own box. Give the element `touch-action: none`. Handlers may be inline; they are read fresh each event.

**`<FloatingBar anchor bounds>`** (`FloatingBar.tsx`). A small bar next to a box (`anchor: {x,y,width,height}` in the container's coordinates, `bounds: {width,height}` the container size). Below by default, flips above when it does not fit, clamped inside with 8px margin. The container must be `position: relative`.

**`<TopBar>`** (`TopBar.tsx`). Props: `title`, `backHref` (router link) or `onBack`, `backLabel`, `right`. 48px plus the top safe area.

**`<TabBar items path>`** (`TabBar.tsx`). `items`: `{href,label,icon,match?}`; links go through the app's `Link`, so navigation does not reload; current tab gets `aria-current="page"`. 56px plus the bottom safe area. `PHONE_TABS` (in `PhoneApp.tsx`) is the app's four tabs.

**`PhoneApp`** (`PhoneApp.tsx`). Used by `App.tsx` when `useIsPhone()` is true: `<PhoneApp path page />` where `page` is the translator, lesson, phrasebook or not-found element App already built. 100svh grid (top bar, `.ph-content` scrolling with `overscroll-behavior: contain`, tab bar); `<html>` gets `ph-locked` so the page never scrolls. The menu button opens an "About" sheet holding the credits (what the desktop footer holds; there is no analytics-consent UI in the app). Studio: `StudioHome` (cards from `TOOLS` plus a "Your uploads" row from the library) at `/studio`; a tool is shown full screen (back arrow, no tab bar, grey surround `.ph-tool`) with an Uploads button for Photo and Video that opens the existing uploads panel in a sheet. Only the open tool is mounted (the desktop keeps visited tools mounted).

**`registry.ts`**. `PHONE_TOOLS[slug] = () => <PhonePhoto />` makes a phone editor replace the desktop component for that tool; `phoneElementFor(tool)` falls back to `tool.element`. The editor fills `.ph-tool` (a grid item, `min-height: 0`); size it with `height: 100%`.

Not verified without a phone: drag feel and the detent snap, `visualViewport` and the keyboard bar on iOS Safari, `gesturestart` blocking, long-press timing, safe-area insets, scroll-snap and the edge fades, sheet heights and colours.
