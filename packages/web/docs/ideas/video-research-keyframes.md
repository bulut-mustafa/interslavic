# Keyframes and text/picture animation: research (part H)

## Easing maths (verified)
- CSS Easing Level 1, https://www.w3.org/TR/css-easing-1/ (fetched): a cubic-bezier is four numbers x1,y1,x2,y2 for control points P1, P2 with fixed P0=(0,0), P3=(1,1). The x values must be in [0,1]; y has no limit (overshoot allowed). Input progress is the curve's x, output progress its y. Keywords: ease = (0.25,0.1,0.25,1), ease-in = (0.42,0,1,1), ease-out = (0,0,0.58,1), ease-in-out = (0.42,0,0.58,1). Outside [0,1] the spec extends along the end tangents; we clamp the input instead (a keyframe segment never asks for it).
- The spec gives no polynomial and defers to Fundamentals of Computer Graphics; we use the standard Bernstein form x(s)=3(1-s)^2 s x1 + 3(1-s) s^2 x2 + s^3 (same for y), solve x(s)=input with Newton's method and fall back to bisection on [0,1] when the derivative is tiny or Newton does not converge. The reference value ease(0.5) = 0.8024 is checked in the test.
- Which segment an easing belongs to: as in CSS keyframes, a key's easing shapes the segment from that key to the next (CSS Animations Level 1 animation-timing-function "applies between keyframes", https://www.w3.org/TR/css-animations-1/).

## CapCut keyframes (third-party sources only; capcut.com help pages not read directly)
- Properties keyed: position, scale, rotation, opacity (CapCut PC guide https://www.capcut.com/resource/how-to-add-keyframes-in-capcut ; https://www.alphr.com/capcut-how-to-use-keyframes/). Each has a diamond beside it in the Basic panel; click to add a keyframe at the playhead; moving the playhead and changing a value adds the next keyframe automatically and animates between them. Keyframes show as diamonds on the clip in the timeline.
- Easing: a "keyframe graph" / curves tutorial exists (https://videohighlight.com/v/BxHHyGRdmvk) but the menu path and presets could not be confirmed. We therefore offer linear, ease in, ease out, ease in-out and a custom cubic-bezier (data model only), which are the CSS-spec curves, not a copy of CapCut's list.

## CapCut text/sticker animation
- Three slots In, Out, Loop, independent, stackable on one layer; In/Out have a duration slider, Loop a speed slider (https://autoae.online/blog/how-to-do-text-animation-in-capcut-pc ; https://capcutguide.com/capcut-text-animation/ ; https://tecnobits.com/en/how-to-make-text-animation-in-capcut/). CapCut's own preset names vary by version; ours (fade, slide x4, pop, typewriter) are our own set.

## Not verified
- Exact CapCut easing preset names/curves, default easing of a new key, and Loop speed range. We pick linear as the default for new keys.
