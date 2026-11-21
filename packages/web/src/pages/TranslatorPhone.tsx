import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Translation, GlossedWord, RuleCitation } from '../../../engine/src/pipeline.ts';
import type { Orthography } from '../../../morph/src/orthography.ts';
import { track } from '../analytics.ts';
import { Icon } from '../components/Icon.tsx';
import { ReportForm } from '../components/ReportForm.tsx';
import { permalink } from '../permalink.ts';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import { KeyboardBar } from '../phone/KeyboardBar.tsx';
import { useMenuItems, type MenuItem } from '../phone/menu.tsx';
import { Chip, ChipRow, PhoneIconButton, StickyBar } from '../phone/parts.tsx';
import { useKeyboardInset } from '../phone/useKeyboardInset.ts';
import { Listen, VoicePicker } from '../speech/Listen.tsx';
import { WordDetail } from './WordDetail.tsx';

export interface TranslatorPhoneProps {
  text: string;
  setText: (t: string) => void;
  lang: string;
  setLang: (l: never) => void;
  langs: { value: string; label: string }[];
  placeholder: string;
  orth: Orthography;
  setOrth: (o: Orthography) => void;
  orths: { value: Orthography; label: string }[];
  primary: Translation[];
  alternate: Translation[];
  error: string | null;
  busy: boolean;
  run: () => void;
  rate: number | null;
  wordCount: number;
  unresolved: GlossedWord[];
  dropped: { form: string; why: string }[];
  wordKeys: string[];
  active: string | null;
  setActiveWord: (k: string) => void;
  selected: { word: GlossedWord; citations: Record<string, RuleCitation> } | null;
  selectedIndex: number;
  stepWord: (delta: number) => void;
  asWritten: (surface: string, sentence: string, first: boolean) => string;
  terminal: (text: string) => string;
  legend: { key: string; color: string; label: string }[];
}

type Sheet = 'word' | 'options' | 'report' | null;

const copyText = async (t: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
};

/** A copy icon that says "Copied" for a moment; the icon-only version of CopyButton. */
function CopyIcon({ text, label, event }: { text: string; label: string; event?: string }) {
  const [done, setDone] = useState(false);
  return (
    <PhoneIconButton
      icon={done ? 'check' : 'copy'}
      label={done ? 'Copied' : label}
      disabled={!text}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          track(event ?? 'copy-translation');
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    />
  );
}

/** Share with the phone's own sheet where there is one; otherwise copy the link to the translation. */
function ShareIcon({ text, url }: { text: string; url: string }) {
  const [done, setDone] = useState(false);
  return (
    <PhoneIconButton
      icon={done ? 'check' : 'share'}
      label={done ? 'Link copied' : 'Share'}
      disabled={!text}
      onClick={() => {
        if (typeof navigator.share === 'function') {
          void navigator.share({ text, url }).catch(() => undefined);
        } else {
          void copyText(url).then((ok) => {
            if (!ok) return;
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }
        track('share-translation');
      }}
    />
  );
}

/**
 * The translator on a phone (docs/mobile-design.md): one column, a big input
 * card, language and script as a scrolling chip row, a sticky Translate button
 * above the tab bar (and above the keyboard), result cards with copy and share,
 * and a tapped word opening its card as a bottom sheet. History-like actions
 * (copy link, report) live in the top-bar menu. No hover anywhere.
 */
export function TranslatorPhone(p: TranslatorPhoneProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const kb = useKeyboardInset();
  const results = useRef<HTMLDivElement>(null);
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
  const link = permalink('/', { lang: p.lang, script: p.orth, text: p.text });
  const joined = p.primary.map((s) => s.text).join(' ');
  const hasResult = p.primary.length > 0;

  const menu = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (p.text.trim()) {
      items.push({
        id: 'tr-link',
        label: 'Copy link to this translation',
        icon: 'link',
        onSelect: () => {
          void copyText(link).then((ok) => ok && track('copy-link'));
        },
      });
    }
    if (hasResult) {
      items.push({
        id: 'tr-report',
        label: 'Report a problem',
        icon: 'flag',
        onSelect: () => {
          track('report-open', { where: 'translator' });
          setSheet('report');
        },
      });
    }
    items.push({ id: 'tr-options', label: 'Voice and colour key', icon: 'sliders', onSelect: () => setSheet('options') });
    return items;
  }, [p.text, hasResult, link]);
  useMenuItems('translator', menu);

  // A finished translation is the point: bring it into view.
  useEffect(() => {
    if (hasResult && typeof results.current?.scrollIntoView === 'function') results.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [p.primary, hasResult]);

  const translate = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    p.run();
  };
  const canTranslate = p.text.trim() !== '' && !p.busy;
  const button = (
    <button type="button" className="ph-primary" disabled={!canTranslate} onClick={translate} aria-busy={p.busy}>
      {p.busy ? 'Translating…' : 'Translate'}
    </button>
  );

  const open = (key: string) => {
    p.setActiveWord(key);
    setSheet('word');
  };

  return (
    <div className={`ph-screen pt${sheet ? ' ph-sheet-open' : ''}`}>
      <h1 className="ph-sr">Interslavic translator that shows its reasoning for every word</h1>

      <section className="ph-card-box pt-input">
        <textarea
          className="ph-field pt-text"
          value={p.text}
          onChange={(e) => p.setText(e.target.value)}
          spellCheck={false}
          rows={5}
          placeholder={p.placeholder}
          aria-label="Text to translate"
        />
        <div className="pt-input-tools">
          {canPaste && (
            <PhoneIconButton
              icon="clipboard"
              label="Paste"
              onClick={() => {
                void navigator.clipboard.readText().then((t) => t && p.setText(p.text ? `${p.text} ${t}` : t)).catch(() => undefined);
              }}
            />
          )}
          {p.text && <PhoneIconButton icon="close" label="Clear text" onClick={() => p.setText('')} />}
        </div>
      </section>

      <ChipRow label="Language and script">
        {p.langs.map((l) => (
          <Chip key={l.value} selected={p.lang === l.value} onClick={() => p.setLang(l.value as never)}>
            {l.label}
          </Chip>
        ))}
        <span className="ph-chip-sep" aria-hidden="true" />
        {p.orths.map((o) => (
          <Chip key={o.value} selected={p.orth === o.value} onClick={() => p.setOrth(o.value)} label={`${o.label} script`}>
            {o.label}
          </Chip>
        ))}
        <span className="ph-chip-sep" aria-hidden="true" />
        <Chip onClick={() => setSheet('options')}>
          <Icon name="sliders" size="1rem" /> Options
        </Chip>
      </ChipRow>

      <div ref={results} className="pt-results" aria-live="polite">
        {p.error ? (
          <section className="ph-card-box pt-error">
            <h2>The translator is not answering</h2>
            <p className="ph-hint-strong">It may still be starting up. Please try again in a minute.</p>
            <button type="button" className="ph-secondary" onClick={p.run}>
              Try again
            </button>
          </section>
        ) : !hasResult ? (
          <section className="ph-card-box pt-empty">
            <p className="ph-hint-strong">{p.busy ? 'Translating…' : 'Type or paste a sentence, then tap Translate. Every word shows why it was chosen.'}</p>
          </section>
        ) : (
          p.primary.map((s, i) => (
            <article className={`ph-card-box pt-card${p.busy ? ' is-busy' : ''}`} key={i} aria-label={`Translation ${i + 1}`}>
              <p className="pt-out" lang="isv">
                {s.words.map((w, j) => (
                  <Fragment key={`${i}-${j}`}>
                    {j > 0 ? ' ' : null}
                    <button
                      type="button"
                      className={['output-word', p.active === `${i}-${j}` && sheet === 'word' ? 'is-active' : '', w.validation !== 'validated' ? 'is-flagged' : ''].filter(Boolean).join(' ')}
                      onClick={() => open(`${i}-${j}`)}
                    >
                      {p.asWritten(w.surface, s.text, j === 0)}
                    </button>
                  </Fragment>
                ))}
                {p.terminal(s.text)}
              </p>
              {p.alternate[i] && (
                <p className="pt-alt" aria-label="The same text in the other script">
                  {p.alternate[i]!.text}
                </p>
              )}
              {s.warnings?.length ? (
                <ul className="pt-warn" role="note" aria-label="Expressions translated word by word">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="pt-actions">
                <CopyIcon text={s.text} label="Copy translation" />
                <ShareIcon text={s.text} url={link} />
                <Listen text={s.text} where="translator" />
              </div>
            </article>
          ))
        )}

        {hasResult && p.rate !== null && (
          <section className="ph-card-box pt-meter" aria-label="Words found in the lexicon">
            <span className="meter-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(p.rate * 100)}%` }} />
            </span>
            <p className="ph-hint-strong">
              {p.wordCount - p.unresolved.length} of {p.wordCount} words found in the lexicon
            </p>
          </section>
        )}

        {(p.dropped.length > 0 || p.unresolved.length > 0) && (
          <section className="ph-card-box pt-notes">
            {p.dropped.length > 0 && (
              <div>
                <h3>Left out</h3>
                {p.dropped.map((d, i) => (
                  <p key={i} className="ph-hint-strong">
                    <span className="dropped-word">{d.form}</span> - {d.why}
                  </p>
                ))}
              </div>
            )}
            {p.unresolved.length > 0 && (
              <div>
                <h3>Not verified</h3>
                {p.unresolved.map((w, i) => (
                  <p key={i} className="ph-hint-strong">
                    <span className="dropped-word">{w.surface}</span> -{' '}
                    {w.validation === 'untranslated' ? 'no Interslavic word found; the original is kept' : 'not in the full-form lexicon, so it may not be a real form'}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {kb > 0 ? (
        <KeyboardBar label="Translate">{button}</KeyboardBar>
      ) : (
        <StickyBar>{button}</StickyBar>
      )}

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'word' && p.selected ? p.selected.word.surface : sheet === 'report' ? 'Report a problem' : 'Options'}
        detents={sheet === 'report' ? ['full'] : ['half', 'full']}
      >
        {sheet === 'word' && p.selected && (
          <div className="pt-word">
            <div className="pt-stepper">
              <button type="button" className="ph-secondary" onClick={() => p.stepWord(-1)} disabled={p.selectedIndex <= 0} aria-label="Previous word">
                <Icon name="chevronLeft" /> Prev
              </button>
              <span className="pt-count">
                {p.selectedIndex + 1} of {p.wordKeys.length}
              </span>
              <button type="button" className="ph-secondary" onClick={() => p.stepWord(1)} disabled={p.selectedIndex >= p.wordKeys.length - 1} aria-label="Next word">
                Next <Icon name="chevronRight" />
              </button>
            </div>
            <WordDetail word={p.selected.word} citations={p.selected.citations} />
          </div>
        )}
        {sheet === 'options' && (
          <div className="ph-sheet-stack">
            <VoicePicker />
            <section aria-label="How much to trust a line" className="pt-legend">
              <h3>How much to trust a line</h3>
              {p.legend.map((l) => (
                <p key={l.key} className="ph-hint-strong">
                  <i style={{ background: l.color }} /> {l.label}
                </p>
              ))}
            </section>
          </div>
        )}
        {sheet === 'report' && hasResult && (
          <ReportForm source={p.text} output={joined} lang={p.lang} orthography={p.orth} onClose={() => setSheet(null)} />
        )}
      </BottomSheet>
    </div>
  );
}
