# Video editor: transitions (part G)

## What the sources say

Third-party unless marked. "Fetched" means I read the page; "search result" means I only saw the search summary.

- **CapCut, official help** (fetched): https://www.capcut.com/help/transitions-not-working - "Some transitions require enough frames from both clips. If the clips are very short, CapCut may not apply the transition." and "If your timeline contains only one clip or clips are not placed next to each other, the transition cannot be applied." (a gap hides the icon; search result for https://www.capcut.com/help/transitions-in-capcut). The page says nothing about overlap or total length.
- **CapCut, third party** (fetched): https://www.tourboxtech.com/en/news/capcut-transitions.html - "the maximum duration of a transition is half the length of the shorter adjacent clip" (example 4 s and 3 s clips: 1.5 s). Duration is changed in the properties panel or by dragging the transition's ends on the timeline. It does not say whether the edit gets shorter. Default durations differ between guides (0.5 s in one, up to 5 s on mobile in another; search results only), so 0.5 s here is a common default, not a CapCut fact.
- **CapCut and total length: not found.** No source I could reach says whether a CapCut transition shortens the edit. I did not guess.
- **Premiere Pro** (search results of Adobe community threads and the manual, https://www.manualslib.com/manual/233470/Adobe-65021048.html?page=181): a transition centred on a cut needs spare ("handle") footage past each clip's out/in point; if there is not enough, Premiere shortens the transition, repeats still frames, or starts/ends it at the cut instead. The sequence does not get shorter because the transition draws on footage already trimmed off (the search summary's inference; not stated verbatim).
- **Final Cut Pro** (search result, https://support.apple.com/sl-si/guide/final-cut-pro/ver761c7150/mac): a transition can use spare media at the clip ends (duration unchanged) or overlap the clips, which is a ripple edit and shortens the project.
- **Windows Movie-style storyboard editors** (search result, https://deskshare.com/help/amc/TransitionDuration.aspx): clips overlap and the total length changes with the transition duration.

So editors use two models: (1) consume handles, length unchanged; (2) overlap, length shrinks by the duration.

## Decision: centred on the cut, handles consumed, clips never move

`clip.transitionIn = { kind, duration }` sits on the clip AFTER the join. The window is `[cut - d/2, cut + d/2)` on the edit clock, `cut = startOf(clips, i)`. `d = min(stored, maxDuration)`, `maxDuration = min(length(a), length(b)) / 2` (the CapCut rule from the third-party guide); first clip: none; below 0.1 s the clips are "too short" and nothing plays.

During the window both clips play: the outgoing clip continues past its out-point, the incoming one starts before its in-point, both from the source's spare footage. With no spare footage the source time is clamped to the file (0 or its duration), so the video element holds its first or last frame (Premiere repeats frames in the same case). Audio crossfades with equal power (cos/sin of the progress; my choice for level loudness).

### Why not the overlap model (shorter edit)

The main track is a gap-free sequence and `length/startOf/total/locate` are used by the editor, transport, export and cue mapping (captions, text layers and overlays are placed on the edit clock). Overlap would make every clip start earlier by the sum of earlier transitions, so adding or changing a transition would shift every later layer, caption and cue; `total` would no longer be the sum of `length`; `locate` at the join would be ambiguous. Centred transitions leave all of those functions byte-for-byte unchanged, so nothing else needed to change, and "undo" of a transition changes no timing.

Cost: the picture/sound inside the window are not exactly what was trimmed to (the outgoing clip shows footage past its out-point). If the person trimmed deliberately to hide something there, it flashes during the transition; same trade-off as Premiere's handles. Accepted and documented.

### Side effects handled in `timeline.ts`

- A split keeps the transition on the first half only (the second half's join is now a hard cut).
- Anything that can change which clip is first (remove, move, insert) drops `transitionIn` from the new first clip.
- Trim does not rewrite the transition; `effectiveDuration` re-clamps at read time, so shortening a clip shortens or removes the transition by itself.
- `advance` is unchanged (it follows source continuity at the cut). `upcomingItems` preloads the incoming clip at the start of the window.

## Drawing (canvas 2D, all exactly implementable)

Kinds: dissolve, dip to black, slide left/right/up/down (new picture slides over the old), push left/right (both move), wipe left/right (clip rectangle, `clip()`), zoom (old picture scales to 1.5x while the new one fades in). Ease in/out is the cubic ease-in-out formula; dissolve and dip are linear. APIs used: `save/restore`, `translate`, `scale`, `beginPath/rect/clip`, `fillRect`, `globalAlpha` (MDN CanvasRenderingContext2D, same as the existing compositor). Not verified in a real browser: only a recording fake context in vitest.

## Not verified

- CapCut's behaviour on total length and its default duration.
- Real-browser look of the drawn transitions and of the CSS previews (jsdom has no layout/animation).
- That a `<video>` seeked before 0 or past its end holds the first/last frame in all browsers (expected from clamping to [0, duration] in `schedule.ts`; transport must seek to that clamped time).
