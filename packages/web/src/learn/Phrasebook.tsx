import { useMemo, useState } from 'react';
import { track } from '../analytics.ts';
import { toCyrillic } from '../../../morph/src/orthography.ts';
import { Tabs } from '../components/Tabs.tsx';
import { PHRASEBOOK, sourceUrl, type Phrase } from './phrasebook.ts';

type Mode = 'list' | 'cards';

/** Everyday phrases, to read as a list or to learn as flashcards. */
export function Phrasebook() {
  const [mode, setMode] = useState<Mode>('list');
  return (
    <main className="phrasebook">
      <h1>Phrasebook</h1>
      <p className="lesson-summary">
        Everyday phrases to learn by heart. Each is a set phrase from the Interslavic dictionary or
        a sentence written by an Interslavic speaker on Tatoeba.
      </p>
      <Tabs
        label="View"
        options={[
          { value: 'list', label: 'List' },
          { value: 'cards', label: 'Flashcards' },
        ]}
        value={mode}
        onChange={(m) => {
          track('phrasebook-view', { mode: m });
          setMode(m);
        }}
      />
      {mode === 'list' ? <PhraseList /> : <Flashcards />}
    </main>
  );
}

function PhraseList() {
  return (
    <div className="phrase-groups">
      {PHRASEBOOK.map((group) => (
        <section key={group.title} className="phrase-group">
          <h2>{group.title}</h2>
          {group.phrases.map((p) => (
            <div className="phrase" key={p.isv}>
              <p className="phrase-isv" lang="isv">{p.isv}</p>
              <p className="phrase-cyr" lang="isv-Cyrl">{toCyrillic(p.isv)}</p>
              <p className="phrase-en">
                {p.en}
                {p.note && <span className="phrase-note"> - {p.note}</span>}
                <a className="phrase-source" href={sourceUrl(p.source)} target="_blank" rel="noreferrer">
                  {p.source === 'dictionary' ? 'dictionary' : `Tatoeba ${p.source}`}
                </a>
              </p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Flashcards() {
  const [group, setGroup] = useState('all');
  const deck: Phrase[] = useMemo(
    () => PHRASEBOOK.filter((g) => group === 'all' || g.title === group).flatMap((g) => g.phrases),
    [group],
  );
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const card = deck[index % deck.length]!;

  const go = (delta: number) => {
    setIndex((i) => (i + delta + deck.length) % deck.length);
    setShown(false);
  };

  return (
    <div className="cards">
      <label className="cards-group">
        <span>Topic</span>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setIndex(0);
            setShown(false);
          }}
        >
          <option value="all">All phrases</option>
          {PHRASEBOOK.map((g) => (
            <option key={g.title} value={g.title}>
              {g.title}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className={`card${shown ? ' is-shown' : ''}`}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide the meaning' : 'Show the meaning'}
      >
        <span className="card-isv" lang="isv">{card.isv}</span>
        <span className="card-cyr" lang="isv-Cyrl">{toCyrillic(card.isv)}</span>
        <span className="card-en" aria-live="polite">
          {shown ? card.en : 'Tap to see the meaning'}
        </span>
      </button>

      <div className="cards-nav">
        <button type="button" className="text-button" onClick={() => go(-1)}>
          ‹ Previous
        </button>
        <span className="cards-count">
          {(index % deck.length) + 1} of {deck.length}
        </span>
        <button type="button" className="text-button" onClick={() => go(1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}
