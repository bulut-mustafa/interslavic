# The Studio

One workspace at `/studio` for the tools beside the translator, for learners, teachers and anyone posting about Interslavic. It has an interface of its own - a light workspace in the site's palette with a rail of tools down the left (Edit, Text & audio, Learn & teach), a status bar showing whether the engine and the parser answer, and a home of tool cards - and shows none of the site's header or footer (the dictionary credit stays at the foot of every Studio page). The tools are listed once, in `packages/web/src/studio/tools.tsx`; the rail, the home, the routes and the page titles all read that list. Files are chosen with one shared drop zone (`components/DropZone.tsx`) that takes a drag or a click and refuses the wrong kind of file in plain words. The worksheet stays white because it is what gets printed.

**Work is kept while the Studio is open.** A tool, once visited, stays mounted and is only hidden when another is shown (`studio/Studio.tsx`), so a picture, its text and its undo history, a video edit, or a subtitle file are all there when the user comes back. A hidden tool stops what should not carry on unseen (a playing video) and takes what arrived meanwhile (a transcript sent to Subtitles) when it is shown again (`studio/active.tsx`). The Photo editor's pages are the exception: they are also kept on the user's own device in the browser's database (IndexedDB; `photo/store.ts`), and come back after a reload or on the next visit. The other tools are memory only: a reload or closing the tab starts empty, because their files are too large to store quietly.

**Uploads sheet.** The Photo and Video editors share a library (`studio/library.tsx`) of every picture and video opened or added in this visit, shown in a sheet (`studio/UploadsSheet.tsx`) that opens from the Uploads button in the Studio's left rail: one click opens an item in the right editor (going there first), the one in use is marked, and files can be dropped on it. The rail itself folds to its icons (the choice is remembered), and going to a tool from the folded rail does not open it. Nothing in it is stored or sent. In the Video editor, opening a file over work that has edits asks first (`components/ReplaceBanner.tsx`); the Photo editor never replaces a picture, it adds a page (below). Each page
shows only what the dictionary, the full-form index, the lessons or the translator already hold; none
adds Interslavic of its own. How each was checked is in the tests named below and in the
[verification log](verification/lexicon-and-word-sense.md).

| Page | For | What it does | Where it lives |
|---|---|---|---|
| `/studio/worksheets` | teachers | Printable worksheet (browser print or save as PDF) from the lessons' exercises, blank inflection tables and phrasebook topics, with an answer key on its own page. | `packages/web/src/worksheets/` |
| `/studio/photo` | creators | **Photo editor.** Open a picture and its words are found at once (tesseract.js 7, Apache-2.0, in the browser; the reader and language data, 2-3 MB, come from cdn.jsdelivr.net) but left exactly as they are, like Live Text on a phone: hover lights them, dragging, double-clicking (a line) or Control/Command A selects them. Only the selected words are acted on: they become a text layer where they were, at their width and colour, with the original lettering covered by a colour sampled from around it, the first time they are translated, retyped or restyled (`photo/live-text.ts`). **Pages:** any number of pictures can be open at once (and are kept on this device between visits: the original picture once, then each page's text layers, undo steps and the letters already found, so nothing is read again; nothing is sent anywhere, clearing the browser's site data clears them, a full disk is reported on the strip instead of hidden, and the browser is asked not to evict them), each a page with its own text and undo history, switched from a strip along the bottom (like Canva's pages). Every page stays mounted while another is shown, so nothing is lost on the way; a page with unsaved changes has a dot, and removing it asks first. One page is saved as a PNG, or all of them as one zip (`zip.ts`, stored, no compression). Opening the same file again goes to its page. A small toolbar on the selection translates, edits on the picture, or copies; the controls are a panel on the right. Edit, move (drag or arrow keys), restyle (nine presets, font, size, colour, outline, shadow, glow, box, opacity, wrap width), add more, translate into Interslavic, undo and redo, save as PNG. | `packages/web/src/photo/`, `packages/web/src/editor/` |
| `/studio/video` | creators | **Video editor.** Split, trim, reorder and delete clips; text and subtitles on the video for as long as wanted, with the same styles; import an .srt (mapped through the cuts); translate the text into Interslavic; save as a new video recorded in the browser (WebM). | `packages/web/src/video/`, `packages/web/src/editor/` |
| `/studio/subtitles` | creators | An .srt in English, Russian or Ukrainian to Interslavic with the same timing; Interslavic only or with the original beneath. Cues the engine is unsure of are listed with its own reasons. | `packages/web/src/subtitles/`, `POST /api/translate-batch`, `packages/server/src/batch.ts` |
| `/studio/watch` | students | Play a video from the user's own disk with its Interslavic .srt (and optionally the original's): the line on screen is split into words, a tapped word shows the dictionary's reading of it, a line can be repeated, speech slowed, and sentences saved - each with its video name and time - and exported as an Anki text file. | `packages/web/src/player/`, `POST /api/analyze` |
| `/studio/recording` | creators | Speech in an audio or video file to subtitles, on the user's device (Whisper in a web worker; 73 MB `base` or 238 MB `small` model fetched once from Hugging Face). The transcript is editable, saves as .srt, and goes on to `/studio/subtitles` to be translated. | `packages/web/src/transcribe/` |
| Other Slavic languages (in both editors) | creators | A word lookup built from the dictionary's own columns (Russian, Belarusian, Ukrainian, Polish, Czech, Slovak, Slovenian, Croatian, Serbian, Macedonian, Bulgarian): tap a word's form to add it to the text. | `packages/lexicon/src/cognates.ts`, `GET /api/lookup`, `packages/web/src/editor/WordLookup.tsx` |
| Listen buttons | students | Read Interslavic aloud with an installed Czech, Polish, Croatian, Slovak, Slovenian or Bosnian voice, chosen by the user. | `packages/web/src/speech/` |
| `/phrasebook` | students | "Download for Anki": the phrasebook as an Anki text import, each note with its source and Tatoeba's licence. | `packages/web/src/learn/anki.ts` |
| `/?lang=&script=&text=` | everyone | "Copy link" on the translator makes an address that opens with the text in it. | `packages/web/src/permalink.ts` |

## What each one will and will not say

- **Worksheets** are assembled, not written. A test holds every item to the lesson or phrasebook
  entry it came from.
- **Subtitles** translates each subtitle alone (a dialogue cue line by line, any other cue as one
  sentence), so a sentence that runs over several subtitles can come out wrong. Markup such as `<i>`
  is removed for translation and a cue that was italic throughout stays italic. A file may have 1,500
  subtitles; the server takes 50 lines per request and one batch at a time (429 when busy), because the
  parser is a single process, and the page retries. Firebase Hosting ends a rewritten request after
  60 seconds ([DEPLOY.md](../DEPLOY.md)); a 50-line batch took 2.5 s locally.
- **Recording** shows the error rates the Whisper paper reports (Table 13, Fleurs; read speech) for the
  chosen model: base 8.9 / 20.5 / 37.7 % and small 6.1 / 11.4 / 19.3 % for English / Russian /
  Ukrainian. The page runs the 8-bit quantised files, which the paper did not measure, and real
  recordings are harder, so it asks the user to correct the transcript before translating. Checked
  end to end in Chrome with synthetic speech (English with `base`; English, Russian, Ukrainian with
  `small`) - this shows the pipeline works, not how accurate it is on real recordings. Audio never
  leaves the device; the browser fetches the model from huggingface.co and the ONNX runtime from
  cdn.jsdelivr.net (the build leaves the library's 27 MB bundled copy of the runtime out because it
  is never loaded). Limits: 200 MB, 60 minutes; long audio is cut at quiet moments into segments of
  about 5 minutes. Whisper's code and weights are MIT-licensed.
- **Listen** sends the text to the voice exactly as written: there is no Interslavic voice and no
  sourced rule here for respelling it, so only voices of Latin-script Slavic languages are offered and
  the page says the result is an approximation. Voices are whatever the browser provides, so the button
  is absent where there are none.
- **Photo editor** was checked in Chrome on a drawn sign (three lines found, covered, translated and
  placed where they were) and on clean English and Russian text; real photos are harder, and the page says
  so. The cover is a colour sampled from a ring around each line (`editor/sample.ts`): it hides lettering on
  a plain or gently shaded background and cannot rebuild a busy picture behind the text - that needs
  inpainting, which this does not attempt. The reader's confidence is tesseract's own number. A photo
  larger than 2400 px is scaled down to edit, and the saved picture is that size.
- **Video editor** edits a list of clips: the original file is never changed, and trimming can always go
  back out. Playback hops between clips in one `<video>` element; saving draws each frame with its text
  and records it with the original sound, at the video's own speed (a one-minute edit takes a minute),
  as WebM - or MP4 where the browser records that - with the working frame at most 1280 px on the long
  side. Checked in Chrome with a 6-second test video: cut, text added, exported; the file was exactly the
  edited length, its first frame was the cut point, the styled text was in the frames and the audio track
  was present. A recorded WebM reports an infinite length until its end is found; the editor does that
  (`video/duration.ts`). Limits: no transitions, effects, speed changes or multiple tracks; the saved WebM
  has no length stored, which some players ignore.
- **Other Slavic languages**: the translator writes Interslavic only, and nothing here pretends otherwise.
  The lookup shows the dictionary's words one at a time (a cell the dictionary marks with `!`, which its
  documentation does not explain, is shown dotted as unconfirmed); stringing words into a sentence in
  another language is left to the user.
- **Anki export** follows Anki's text-import format, which needs Anki 2.1.54 or later
  (https://docs.ankiweb.net/importing/text-files.html).

## Next

Not done: audio or image clips on Anki cards (Anki's plain-text import cannot carry media; that needs a .apkg package), word-level timing in transcripts, and OCR tuning for skewed or handwritten photos.


## The Studio's common design (2026-11-08)

Every tool follows the same few rules, set by the Photo editor and then applied to the others:

- **Do the first step for the user.** Photo reads its text when a picture opens; Subtitles translates when a file opens, in the language it guesses from the letters (`subtitles/guess.ts`); Worksheets opens with a first worksheet already on the page; Watch takes a video and its subtitle files dropped together, in any order (`player/files.ts`), and works out which is Interslavic and which the original. Recording is the exception on purpose: it starts a 238 MB model download, so it waits for the button.
- **One slim bar, icon buttons, nothing but the work.** A file chip, the few actions, undo and redo as icons, and the one primary button (`components/Icon.tsx`). Long explanations are one line on the empty start or folded away. The old "What it does" strip is gone; the tool's summary is its tooltip and its card on the Studio home.
- **Settings sit in the side panel, which only shows controls for what is selected.** With nothing selected it holds the settings (language, script, sound); with text selected it shows the compact text controls (`editor/Inspector.tsx`, shared by Photo and Video). A small toolbar and a typing box appear on the selected text (`editor/SelectionOverlay.tsx`, shared).
- **Correct things where they stand.** Subtitles' translations are editable in place and the lines the translator doubted stay marked until looked at; Recording's transcript plays the recording from any subtitle's time.
- **Kept work.** Photo's pages (`photo/store.ts`) and the Video editor's project (`video/store.ts`: the video file once, then the cuts, text, undo steps and settings as they change) are kept on the device between visits in the browser's database (`studio/idb.ts`), and come back after a reload; a project that no longer fits its video (longer than it) falls back to the whole video, and opening a different video forgets the old edit. A full disk is reported, not hidden. Subtitles, Recording and Watch are memory only so far.
- **Video extras.** Little pictures from along the video show inside each clip (`video/frames.ts`). "Captions" makes text on the video from its speech, with the same in-browser Whisper pipeline as the Recording page (`transcribe/run.ts`), after asking, because the model is a one-time download; the captions land at the times they were spoken, on the parts of the video that were kept.
