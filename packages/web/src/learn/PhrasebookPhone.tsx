import { useMemo, useState } from 'react';
import { track } from '../analytics.ts';
import { toCyrillic } from '../../../morph/src/orthography.ts';
import { Icon } from '../components/Icon.tsx';
import { downloadText } from '../download.ts';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import { useMenuItems, type MenuItem } from '../phone/menu.tsx';
import { Chip, ChipRow, PhoneIconButton, StickyBar } from '../phone/parts.tsx';
import { Listen, VoicePicker } from '../speech/Listen.tsx';
import { ankiTsv, type Direction } from './anki.ts';
import { PHRASEBOOK, sourceUrl, type Phrase } from './phrasebook.ts';

type Mode = 'list' | 'cards';
type Sheet = { kind: 'phrase'; phrase: Phrase; topic: string } | { kind: 'anki' } | null;

const fileFor = (direction: Direction, groups = PHRASEBOOK) => ankiTsv(groups, direction);

/**
 * The phrasebook on a phone: a search field pinned to the top, topic chips,
 * each phrase a card. Tapping a card opens a small sheet (listen, copy, save to
 * Anki); there are no hover controls. Anki export and the flashcard view are in
 * the top-bar menu.
 */
export function PhrasebookPhone() {
  const [mode, setMode] = useState<Mode>('list');
  const [topic, setTopic] = useState('all');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [direction, setDirection] = useState<Direction>('isv-en');

  const menu = useMemo<MenuItem[]>(
    () => [
      { id: 'pb-mode', label: mode === 'list' ? 'Practise as flashcards' : 'Back to the phrase list', icon: 'book', onSelect: () => { track('phrasebook-view', { mode: mode === 'list' ? 'cards' : 'list' }); setMode(mode === 'list' ? 'cards' : 'list'); } },
      { id: 'pb-anki', label: 'Export all for Anki', icon: 'save', onSelect: () => setSheet({ kind: 'anki' }) },
    ],
    [mode],
  );
  useMenuItems('phrasebook', menu);

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      PHRASEBOOK.filter((g) => topic === 'all' || g.title === topic)
        .map((g) => ({
          ...g,
          phrases: g.phrases.filter((p) => !q || p.isv.toLowerCase().includes(q) || p.en.toLowerCase().includes(q) || toCyrillic(p.isv).toLowerCase().includes(q)),
        }))
        .filter((g) => g.phrases.length > 0),
    [topic, q],
  );

  return (
    <div className="ph-screen ph-phrasebook">
      <div className="ph-search">
        <input
          type="search"
          className="ph-field"
          placeholder="Search phrases"
          aria-label="Search phrases"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <ChipRow label="Topic">
        <Chip selected={topic === 'all'} onClick={() => setTopic('all')}>
          All
        </Chip>
        {PHRASEBOOK.map((g) => (
          <Chip key={g.title} selected={topic === g.title} onClick={() => setTopic(g.title)}>
            {g.title}
          </Chip>
        ))}
      </ChipRow>

      {mode === 'list' ? (
        groups.length === 0 ? (
          <p className="ph-hint-strong">No phrase matches &ldquo;{query}&rdquo;.</p>
        ) : (
          groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h2 className="ph-section-title">{g.title}</h2>
              <ul className="ph-list">
                {g.phrases.map((p) => (
                  <li key={p.isv}>
                    <button type="button" className="ph-row ph-phrase" aria-label={`${p.isv}: ${p.en}`} onClick={() => setSheet({ kind: 'phrase', phrase: p, topic: g.title })}>
                      <span className="ph-phrase-isv" lang="isv">
                        {p.isv}
                      </span>
                      <span className="ph-phrase-en">{p.en}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )
      ) : (
        <PhoneFlashcards deck={groups.flatMap((g) => g.phrases)} />
      )}

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.kind === 'anki' ? 'Export for Anki' : 'Phrase'}
        detents={['half']}
      >
        {sheet?.kind === 'phrase' && (
          <div className="ph-sheet-stack">
            <p className="ph-sheet-isv" lang="isv">
              {sheet.phrase.isv}
            </p>
            <p className="ph-sheet-cyr" lang="isv-Cyrl">
              {toCyrillic(sheet.phrase.isv)}
            </p>
            <p className="ph-hint-strong">
              {sheet.phrase.en}
              {sheet.phrase.note && <> - {sheet.phrase.note}</>}
            </p>
            <div className="ph-sheet-row">
              <CopyAction text={sheet.phrase.isv} />
              <Listen text={sheet.phrase.isv} label="Speak" where="phrasebook" />
              <button
                type="button"
                className="ph-secondary"
                onClick={() => {
                  downloadText(
                    'interslavic-phrase-anki.txt',
                    fileFor(direction, [{ ...PHRASEBOOK.find((g) => g.title === (sheet as { topic: string }).topic)!, phrases: [sheet.phrase] }]),
                    'text/tab-separated-values',
                  );
                  track('anki-export', { direction, one: true });
                }}
              >
                <Icon name="save" /> Save to Anki
              </button>
            </div>
            <VoicePicker />
            <a className="ph-source-link" href={sourceUrl(sheet.phrase.source)} target="_blank" rel="noreferrer">
              Source: {sheet.phrase.source === 'dictionary' ? 'the Interslavic dictionary' : `Tatoeba ${sheet.phrase.source}`}
            </a>
          </div>
        )}
        {sheet?.kind === 'anki' && (
          <div className="ph-sheet-stack">
            <p className="ph-hint-strong">Every phrase as a text file for Anki&rsquo;s <em>File &rsaquo; Import</em> (version 2.1.54 or later). Each note carries its topic and source.</p>
            <label>
              Card shows
              <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} aria-label="Card shows">
                <option value="isv-en">Interslavic, answer in English</option>
                <option value="en-isv">English, answer in Interslavic</option>
              </select>
            </label>
            <button
              type="button"
              className="ph-primary"
              onClick={() => {
                downloadText('interslavic-phrasebook-anki.txt', fileFor(direction), 'text/tab-separated-values');
                track('anki-export', { direction });
              }}
            >
              Download for Anki
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function CopyAction({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ph-secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }, () => undefined);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} /> {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function PhoneFlashcards({ deck }: { deck: Phrase[] }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  if (deck.length === 0) return <p className="ph-hint-strong">No phrases to practise.</p>;
  const at = index % deck.length;
  const card = deck[at]!;
  const go = (d: number) => {
    setIndex((i) => (i + d + deck.length) % deck.length);
    setShown(false);
  };
  return (
    <>
      <button type="button" className={`ph-flash${shown ? ' is-shown' : ''}`} onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide the meaning' : 'Show the meaning'}>
        <span className="ph-sheet-isv" lang="isv">{card.isv}</span>
        <span className="ph-sheet-cyr" lang="isv-Cyrl">{toCyrillic(card.isv)}</span>
        <span className="ph-flash-en" aria-live="polite">{shown ? card.en : 'Tap to see the meaning'}</span>
      </button>
      <StickyBar label="Flashcards">
        <PhoneIconButton icon="chevronLeft" label="Previous" onClick={() => go(-1)} />
        <span className="ph-flash-count">{at + 1} of {deck.length}</span>
        <Listen text={card.isv} where="flashcard" />
        <button type="button" className="ph-primary ph-flash-next" onClick={() => go(1)}>
          Next <Icon name="chevronRight" size="1.2rem" />
        </button>
      </StickyBar>
    </>
  );
}
