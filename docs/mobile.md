# Mobile rubric

What "good on a phone" means for this app, and where each rule comes from. Every
rule is cited; nothing here is from memory. The build and the static audit
(`npm run audit:mobile`) follow this file.

## How this was made

Community Claude Code skills for mobile audits were read (not installed: their
installer runs third-party code through `npx`). Their checklists were used as a
starting point and each number was checked against a primary source:

- [mobile-audit (jersgcodes)](https://skills.lc/jersgcodes/claude-toolkit/jersgcodes-claude-toolkit-skills-mobile-audit-skill-md): viewport and safe areas, 44 px targets, iOS input zoom, hover-only interactions, `h-screen` vs `dvh`, animation properties, keyboard covering inputs.
- [mobile-audit (120ventures)](https://skills.lc/120ventures/claude-skills/120ventures-claude-skills-mobile-audit-skill-md): tap feedback, passive listeners, heavy re-renders (only the first categories could be read).
- [ui-ux-review (escapeboy)](https://github.com/escapeboy/claude-code-kit/blob/master/01-global-optimization/skills/ui-ux-review/SKILL.md): 44x44 px targets, breakpoints, navigation.
- Anthropic's `frontend-design` skill (already available in this environment) for visual quality.

## Rules

1. **Viewport.** `width=device-width, initial-scale=1` plus `viewport-fit=cover`. Without `cover`, the safe-area insets stay 0 (general knowledge; MDN's `env()` page does not state it, so check on a notched phone). Never disable zoom (`user-scalable=no`, `maximum-scale=1`): WCAG 1.4.4.
2. **Safe areas.** Anything fixed or sticky to an edge adds `env(safe-area-inset-*)` to its padding, e.g. `padding-bottom: calc(1em + env(safe-area-inset-bottom))` ([MDN env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env)).
3. **Touch targets.** At least 44 x 44 CSS px for anything tapped on a touchscreen (WCAG 2.5.5 AAA, Apple 44 pt); never below 24 x 24 (WCAG 2.5.8 AA); Android and web.dev say 48 px, with about 8 px between targets ([web.dev](https://web.dev/articles/accessible-tap-targets), [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)). Enlarge with padding under `@media (any-pointer: coarse)` so desktop is unchanged.
4. **Input zoom.** Text inputs, selects and textareas are 16 px or larger, or iOS Safari zooms on focus (single secondary source: verify on a phone). Numeric fields get `inputMode`.
5. **Viewport height.** Not `100vh` for full-screen layouts (it equals `lvh`, the height with the browser bars retracted). Use `svh` where content must never be hidden, `dvh` only where it must fit exactly (it resizes while scrolling and costs performance) ([MDN length](https://developer.mozilla.org/en-US/docs/Web/CSS/length)). Provide a `vh` fallback line before it.
6. **Gestures.** Any element the app drags (canvas layers, resize handles, timeline, sliders) sets `touch-action` so the browser does not cancel the pointer events: `none` only where the app owns every gesture, `pan-y` / `pan-x` for one-axis drags so the page can still scroll the other way, `manipulation` on buttons and links (removes the double-tap delay, keeps zoom) ([MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)). `touch-action: none` blocks pinch-zoom, so use it only on the editing surface itself.
7. **No hover-only meaning.** Nothing important appears only on `:hover` / `onMouseEnter`; tooltips need a tap or focus equivalent; hover styles go inside `@media (hover: hover)`.
8. **No keyboard-only features.** Every shortcut action (delete, duplicate, undo, redo, select all) has a visible control a thumb can reach.
9. **Keyboard.** A focused input is not hidden by the on-screen keyboard or a sticky bar.
10. **Layout.** No horizontal page scroll at 320 px; text wraps; panels that are side columns on desktop become a bottom sheet or a stacked section on a phone; the picture or timeline gets the first screenful, controls come after or float.
11. **Motion and performance.** Animate `transform` and `opacity`, never width, height, top or left; no `transition: all`; scroll and touch listeners are passive unless they call `preventDefault`; respect `prefers-reduced-motion`.
12. **Tap feedback.** A pressed state (`:active`) or a busy state on everything tappable.

## Not covered by any check here

Real devices: Safari's behaviour (input zoom, safe areas, `dvh`), notches, and
how a thumb actually reaches things. The audit script reads source; it cannot
see a screen. The person checks on a phone.

## Audit status (2026-11-21)

`npm run audit:mobile`: 0 errors, 12 warnings. All remaining warnings are
expected: the 10 `100vh` lines are the deliberate fallback written before each
`svh` line; one is the `::file-selector-button` text size (not a text field); one
is the crop sheet, whose safe-area padding sits on a child rule the script does
not read.

## Known gaps (not built)

- Pinch-zoom on the Photo picture (zoom buttons exist instead).
- Dragging a finger across letters to select Photo text (tap selects a word, tap again a line, Select all selects everything).
- Photo/Video side panels are stacked below the picture, not bottom sheets (the flyouts and crop bar are sheets).
- `title` tooltips on output words and the Cyrillic span in lessons have no tap equivalent.
