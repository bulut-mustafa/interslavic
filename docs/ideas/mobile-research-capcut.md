# CapCut mobile app: layout and interaction research

Date: 2026-11-21. Method: WebSearch and WebFetch only. No app was opened.

Evidence level: CapCut's own help center has almost nothing on mobile layout. Most claims below come from third-party tutorials. Each claim has a source number from the list at the end. Tags:
- [CONFIRMED] stated by at least one fetched source.
- [UNCONFIRMED] not found in any fetched source. These are recalled knowledge or inference and must be checked in the real app.

## 1. Editing screen anatomy

| Part | Finding | Source |
|---|---|---|
| Vertical order | Preview on top, timeline below it, toolbar at the very bottom. [CONFIRMED] | S1, S4 |
| Top bar: Export | The Export button sits in the top-right corner. It is a blue button in the templates flow. One source calls it an arrow pointing right. [CONFIRMED] | S3, S4, S5, S6 |
| Top bar: resolution | A resolution menu sits beside Export (default "AI UHD" in one version). [CONFIRMED, one source] | S4 |
| Top bar: back/close | Top-left back or close arrow. [UNCONFIRMED] | none |
| Preview | A large frame above the timeline that shows the frame at the playhead. [CONFIRMED] | S4 |
| Play, undo, redo | Undo and redo are "curved arrows located on top of your timeline on the right hand side". [CONFIRMED] | S3 |
| Keyframe button | The keyframe diamond sits "under the preview window next to the Play button". [CONFIRMED] | S7 |
| Play button | Play sits under the preview, in the same strip as the keyframe diamond. [CONFIRMED by S7 only] | S7 |
| Time readout and fullscreen | A time readout (current / total) and a fullscreen icon in that strip. [UNCONFIRMED] | none |
| Timeline | A horizontal strip where clips, audio and text show as colour-coded blocks. [CONFIRMED] | S4 |
| Playhead | A thin vertical white line. Dragging it sets where a split, keyframe or voiceover starts. [CONFIRMED] | S4, S9 |
| Fixed centre playhead with scrolling content | The playhead stays centred while the clips scroll under it. [UNCONFIRMED] No fetched source states it. One source says you "drag your finger to the left to scroll through your video" on the area beneath the timeline, which is consistent with it. | S3 |
| Add-media button | A grey "+" at the right end of the timeline adds content. [CONFIRMED] | S3 |
| Text rows | Text appears as a new orange bar under the video track. Drag the grey box at either end to change its duration. [CONFIRMED] | S3 |
| Overlay rows | Main video is the bottom track and each overlay gets its own track above it. [CONFIRMED] | S12 |
| Audio rows | The position of audio rows relative to overlays on mobile is not confirmed. | S12 says it did not find this |
| Main track label | No source explains a "Main track" label. [UNCONFIRMED] | none |

### Bottom toolbar
- Two modes. [CONFIRMED]
  - Nothing selected: project-level toolbar. Items named: Edit, Audio, Text, Overlay, Effects, Transitions, Ratio, "and more". Home-screen tabs are a different thing (Edit, Templates, Inbox, Me). (S1, S2, S4, S8, S3)
  - A clip selected: clip toolbar. Items named: Split (scissors), Speed, Trim, Volume, Filters, Adjust, Reverse, and others. (S1, S4, S3, S8, S9)
- The toolbar scrolls horizontally. "Swipe to the left on the toolbar at the bottom" reveals more items such as Reverse. [CONFIRMED] (S3)
- Nested toolbars: Text opens Add text, Auto Captions, Stickers and Text template. Audio opens Sounds. Effects opens Video effects. Overlay is "sometimes nested under Edit". [CONFIRMED] (S3, S12)
- A back arrow on nested toolbars to return up one level. [UNCONFIRMED] (recalled; no fetched source mentions it)
- Split sits under Edit in the older "Edit > Split" description. [CONFIRMED] (S8)

## 2. Timeline gestures

| Gesture | Finding | Source |
|---|---|---|
| Swipe to scrub | Drag the playhead left or right to scrub. Dragging on the timeline area also scrolls. [CONFIRMED] | S4, S3 |
| Pinch to zoom timeline | "Zoom in on the timeline using two fingers for more precision." Zooming in before cuts avoids frame-off splits. [CONFIRMED] | S9, S11 |
| Trim | Tap a clip to select it. White handles appear at both ends. Press and hold a handle and drag. Left handle removes the start, right handle removes the end. [CONFIRMED] | S4, S9 |
| Reorder | Press and hold a clip, drag it into place, release. [CONFIRMED] | S8 |
| Multi-select | Tap and hold one clip, then tap others. [CONFIRMED, brief tip only] | S9 |
| Split at playhead | Move the playhead to the frame, select the clip, tap the scissors Split icon. Delete removes the unwanted piece. [CONFIRMED] | S1, S8, S10 |
| Transitions | After splitting, tap Add Transition. Pick one from the Transition menu and tap "+". The "+" icon between two clips is how you reach transitions. [CONFIRMED: transitions menu. UNCONFIRMED: the "+" sits on the join between clips] | S2, S10 |
| Keyframe diamond | On mobile: move the playhead to the start, tap the diamond, move to the end, tap again, then set the value (pinch in preview for zoom). [CONFIRMED] | S9, S7 |
| Snapping | Magnet snapping of edges and playhead. [UNCONFIRMED] | none |
| Haptics on snap | [UNCONFIRMED] | none |

## 3. Preview gestures and text flow

- Pinch on the preview zooms the selected layer. Drag moves an overlay and pinch resizes it. [CONFIRMED] (S9, S12)
- Rotate with two fingers. [UNCONFIRMED] (one-finger rotate via the corner handle is described, see below)
- Text box has a resize-and-rotate icon at its bottom-right corner. [CONFIRMED] (S13)
- Text flow [CONFIRMED]:
  1. Tap Text, then Add text.
  2. Type into the box shown over the video.
  3. Panel below the text box has tabs. A search result names them as keyboard, style, effects, bubble and animation (S14). A fetched article names Fonts, Styles, Effects, Animation (S13).
  4. Styles has colour templates plus stroke, glow, background, shadow, curve, spacing, bold/italic, case, with an Opacity slider (S13, S3).
  5. Animation has In, Out and Loop, with a speed slider for Loop (S13, S14).
  6. A tick icon applies and closes (S13). A grey check mark in S3.
  7. A text block appears on the timeline.
- Whether tapping existing text in the preview reopens the same panel: [UNCONFIRMED]. Tapping the clip in the timeline opens its edit options (S1, S4).

## 4. Panels, Add flow, Export

- Panel heights, sheet drag handles, snap points: [UNCONFIRMED]. No source gives numbers. Panels appear to replace the toolbar area at the bottom while the preview stays visible (inference from S13 "beneath the text box").
- Sliders: Opacity slider (S13, S3), speed slider (S14). Numeric readout next to the slider: [UNCONFIRMED].
- Add flow: tap New project, select videos from the media picker, tap Add. Multi-select. [CONFIRMED] (S8, S3). Picker tabs and album dropdown: [UNCONFIRMED].
- Export screen: top-right Export, resolution chooser, saves to phone storage or shares to TikTok. Free exports carry a watermark. [CONFIRMED] (S3, S1). Guides say tapping the resolution label opens resolution, frame rate and bitrate controls. 1080p at 30fps is typical, 60fps for action. [CONFIRMED but third-party] (S4, S15, S16). Higher frame rate can cap max resolution. [CONFIRMED, official] (S15). Mobile has limited 4K support in one locale of the official page (S15). Bitrate numbers conflict across sources, treat as unverified.
- App Store listing: speed 0.1x to 100x, 4K at 60fps with smart HDR, multi-track timeline, keyframes on all settings. (S17)

## 5. Visual style

Nothing in the fetched sources covers dark theme, sizes, motion, or icon-over-label layout. All of this section is [UNCONFIRMED] and must be checked on screenshots or in the app:
- Dark theme with near-black background.
- Toolbar items as icon above a short label, scrolling horizontally.
- Accent colours mentioned in sources: orange text bar (S3), blue Export (S3), white playhead and trim handles (S4, S9), grey "+" button (S3).
- Sizes, corner radius, animation timing: no data.

## 6. Mobile versus desktop and iPad

- Official: mobile is for quick edits, short-form and social posting. Desktop is for longer sessions, higher resolution and complex workflows. (S18)
- Official: mobile has a "streamlined timeline". iPad has a multi-track timeline, multi-select media, and more control over layers, timing and transitions. (S19)
- Third-party: desktop gives deeper control over sound, colour and effects, and mobile is weaker for detailed multi-track work. (S18 search snippet)
- Contradiction to note: the App Store listing says the mobile app can "arrange clips on a multi-track timeline" (S17), so "streamlined" does not mean single track. Overlay tracks exist on mobile (S12).
- Desktop-only items: no authoritative list was found. Do not assume one.

## Gaps to close next
Real screenshots or a screen recording are needed for: panel heights, toolbar sizes, fullscreen and time readout placement, snapping, the "+" between clips, back arrow behaviour, text tap flow, theme colours, motion timing. The CapCut help center had no mobile layout article in the search results.

## Sources
- S1 https://www.capcut.com/resource/capcut-tutorial-for-beginners
- S2 https://www.capcut.com/help/editing-and-exporting (search result; not fetched) and WebSearch snippets from TikTok Ads help https://ads.tiktok.com/help/article/about-capcut
- S3 https://www.storyblocks.com/resources/tutorials/how-to-use-capcut
- S4 https://store.hollyland.com/blogs/creator-hub/use-capcut
- S5 https://www.storyblocks.com/resources/tutorials/how-to-use-capcut (export section)
- S6 https://yasirbhutta.github.io/capcut
- S7 search snippet about keyframe icon under preview next to Play (CapCut/third-party tutorial results, WebSearch "CapCut help center how to edit video on mobile split trim keyframe transition"; exact page not identified)
- S8 https://photography.tutsplus.com/tutorials/how-to-quickly-use-capcut-for-video-editing-tutorial-2024--cms-108707
- S9 https://yasirbhutta.github.io/capcut
- S10 https://www.capcut.com/features/how-to-split-a-video-capcut-workflow-comparison (search result only; not fetched)
- S11 https://www.technobezz.com/how-to-zoom-in-on-a-video-in-capcut (search snippet only)
- S12 https://photography.tutsplus.com/tutorials/how-to-create-picture-in-picture-videos-in-capcut--cms-108806 and https://www.capcut.com/resource/overlay-video-on-video (search snippets only)
- S13 https://shotkit.com/add-text-capcut/
- S14 https://www.alphr.com/capcut-add-text/ (search snippet only)
- S15 https://www.capcut.com/help/export-videos-in-capcut and https://www.capcut.com/help/no-2k-or-4k-option-for-export (search snippets only)
- S16 https://cursa.app/en/page/exporting-from-capcut-desktop-mobile-aspect-ratios-quality-settings-and-platform-ready-files (search snippet only)
- S17 https://apps.apple.com/ug/app/id1500855883?l=en-gb
- S18 https://www.capcut.com/help/different-price-for-capcut-mobile-and-desktop and https://www.capcut.com/create/mobile-vs-desktop-video-editing
- S19 https://www.capcut.com/help/feature-difference-between-capcut-app-and-ipad
- Keyframe general flow: https://cursa.app/en/page/keyframes-in-capcut-smooth-zooms-reframes-and-motion-that-follows-the-subject
- Mapping note: S9 content was fetched from yasirbhutta.github.io (pinch zoom, playhead, handles, keyframe steps); S4 from the Hollyland page.
