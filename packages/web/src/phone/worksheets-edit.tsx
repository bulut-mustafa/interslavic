import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Text } from '../learn/Lesson.tsx';
import {
  addCustom,
  addSection,
  duplicateItem,
  emptyDraft,
  hasChanges,
  moveItem,
  patchCustom,
  removeItem,
  removeSection,
  resetItem,
  restoreItem,
  restoreRemoved,
  restoreSection,
  setPatch,
  setSectionText,
  snapshotItem,
  snapshotSection,
  type CustomKind,
  type Draft,
  type Patch,
  type SheetItem,
  type SheetSection,
} from '../worksheets/draft.ts';
import { centerScrollTop } from './sheetMath.ts';
import { useKeyboardInset } from './useKeyboardInset.ts';
import './worksheets-edit.css';

/**
 * The phone editor for a worksheet's questions, shown inside the Edit sheet.
 * One card per question; every text box grows with what is typed (so nothing
 * scrolls inside itself and the sheet is the only thing that scrolls); a
 * multiple-choice question shows its choices as rows, each with a circle to mark
 * the right one. Everything goes through draft.ts, so storage is unchanged.
 *
 * Typing safety: cards are keyed by the question's stable id and are top-level
 * components, so a keystroke never remounts one or loses focus; no handler here
 * sorts or re-creates the list while typing.
 */

const UNDO_MS = 5000;

const KIND_LABEL: Record<SheetItem['kind'], string> = { fill: 'Fill in the blank', choice: 'Multiple choice', phrase: 'Translate', table: 'Table' };
const ADD_KINDS: { kind: CustomKind; label: string; help: string }[] = [
  { kind: 'question', label: 'Fill in the blank', help: 'A sentence with a gap to fill' },
  { kind: 'choice', label: 'Multiple choice', help: 'Pick the right one from several answers' },
  { kind: 'translate', label: 'Translate', help: 'A phrase to write in Interslavic' },
];

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ');

/** A text box that is as tall as its text. iOS-safe: 16px type (no zoom on focus), no native chrome, and the scroll position is kept while it re-measures. */
/** Brings a card into view by scrolling the sheet body only: scrollIntoView would also scroll the clipped page shell on iOS. */
function scrollCardIn(el: HTMLElement | null, block: 'center' | 'nearest'): void {
  const body = el?.closest<HTMLElement>('.ph-sheet-body');
  if (!el || !body) return;
  const box = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (block === 'center') body.scrollTop = centerScrollTop(body.scrollTop, box, r);
  else if (r.top < box.top) body.scrollTop += r.top - box.top;
  else if (r.bottom > box.bottom) body.scrollTop += r.bottom - box.bottom;
}

export function GrowField(props: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  lang?: string;
  /** One line of text: a pasted line break becomes a space, and Enter does `onEnter` (or just closes the keyboard). */
  single?: boolean;
  onEnter?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = props.inputRef ?? own;
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    // Shrinking to "auto" first makes some browsers jump the scroller; put it back where it was.
    const scroller = el.closest('.ph-sheet-body') as HTMLElement | null;
    const top = scroller?.scrollTop ?? 0;
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(48, el.scrollHeight + border)}px`;
    if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
  };
  useLayoutEffect(fit, [props.value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="wse-input"
      aria-label={props.label}
      placeholder={props.placeholder}
      lang={props.lang}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      enterKeyHint={props.single ? (props.onEnter ? 'next' : 'done') : 'enter'}
      value={props.value}
      onChange={(e) => props.onChange(props.single ? oneLine(e.target.value) : e.target.value)}
      onKeyDown={(e) => {
        if (props.single && e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (props.onEnter) props.onEnter();
          else e.currentTarget.blur();
        }
      }}
      /* The sheet itself centres a focused field once the keyboard has settled (BottomSheet), so nothing here scrolls. */
    />
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="wse-field">
      <span className="wse-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="wse-hint">{props.hint}</span>}
    </label>
  );
}

/** The sentence as a student will see it, with each blank drawn as a line. */
function BlankPreview({ prompt }: { prompt: string }) {
  if (prompt.trim() === '') return null;
  const parts = prompt.split('___');
  return (
    <p className="wse-preview" aria-label="How the student sees it">
      {parts.map((p, i) => (
        <span key={i}>
          <Text text={p} />
          {i < parts.length - 1 && <span className="wse-blank" aria-label="blank" />}
        </span>
      ))}
      {parts.length === 1 && <span className="wse-blank wide" aria-label="line to write on" />}
    </p>
  );
}

function ItemCard(props: {
  item: SheetItem;
  first: boolean;
  last: boolean;
  autoFocus: boolean;
  onChange: (p: Patch) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const { item: it } = props;
  const n = it.number;
  const card = useRef<HTMLElement>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const optionRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [focusOption, setFocusOption] = useState<number | null>(null);
  const moved = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!props.autoFocus) return;
    (it.kind === 'fill' || it.kind === 'choice' ? promptRef.current : firstField.current)?.focus();
    scrollCardIn(card.current, 'center');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a move, keep the card on screen and the pressed button focused.
  useEffect(() => {
    if (!moved.current) return;
    const b = moved.current;
    moved.current = null;
    scrollCardIn(card.current, 'nearest');
    if (!b.disabled) b.focus();
  }, [n]);

  useEffect(() => {
    if (focusOption === null) return;
    optionRefs.current[focusOption]?.focus();
    setFocusOption(null);
  }, [focusOption]);

  const move = (by: -1 | 1) => (e: React.MouseEvent<HTMLButtonElement>) => {
    moved.current = e.currentTarget;
    props.onMove(by);
  };

  const insertBlank = () => {
    if (it.kind !== 'fill') return;
    const el = promptRef.current;
    const s = el?.selectionStart ?? it.prompt.length;
    const e = el?.selectionEnd ?? s;
    props.onChange({ prompt: `${it.prompt.slice(0, s)}___${it.prompt.slice(e)}` });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange?.(s + 3, s + 3);
    });
  };

  const options = it.kind === 'choice' ? it.options : [];
  const correct = it.kind === 'choice' ? options.findIndex((o) => o !== '' && o === it.answer) : -1;
  const setOption = (k: number, text: string) => {
    if (it.kind !== 'choice') return;
    const next = options.map((o, i) => (i === k ? text : o));
    // The right answer is remembered as its words, so changing those words has to carry it along.
    props.onChange(k === correct ? { options: next, answer: text } : { options: next });
  };
  const addOption = () => {
    props.onChange({ options: [...options, ''] });
    setFocusOption(options.length);
  };
  const removeOption = (k: number) => props.onChange(k === correct ? { options: options.filter((_, i) => i !== k), answer: '' } : { options: options.filter((_, i) => i !== k) });

  return (
    <article ref={card} className="wse-card" aria-label={`Question card ${n}`} data-kind={it.kind}>
      <header className="wse-card-head">
        <span className="wse-num" aria-hidden="true">
          {n}
        </span>
        <span className="wse-kind">{KIND_LABEL[it.kind]}</span>
        {(it.custom || it.edited) && <span className="wse-badge">Yours</span>}
      </header>

      {it.kind === 'fill' && (
        <>
          <Field label="Question" hint="Type ___ (three underscores) where the blank goes.">
            <GrowField inputRef={promptRef} single label={`Question ${n}`} value={it.prompt} placeholder="Example: Dajte ___ knigu." onChange={(prompt) => props.onChange({ prompt })} />
          </Field>
          <button type="button" className="wse-small" onMouseDown={(e) => e.preventDefault()} onClick={insertBlank}>
            Insert a blank ___
          </button>
          <BlankPreview prompt={it.prompt} />
          <Field label="Answer" hint="If more than one answer is correct, put each on its own line.">
            <GrowField label={`Answer to question ${n}`} value={it.answers.join('\n')} placeholder="The word that fills the blank" onChange={(v) => props.onChange({ answers: v.split('\n') })} />
          </Field>
          <Field label="Why (optional)" hint="Shown beside the answer in the answer key.">
            <GrowField single label={`Explanation for question ${n}`} value={it.why} onChange={(why) => props.onChange({ why })} />
          </Field>
        </>
      )}

      {it.kind === 'choice' && (
        <>
          <Field label="Question">
            <GrowField inputRef={promptRef} single label={`Question ${n}`} value={it.prompt} placeholder="Write the question" onChange={(prompt) => props.onChange({ prompt })} />
          </Field>
          <div className="wse-choices" role="radiogroup" aria-label={`Choices for question ${n}`}>
            <span className="wse-label">Choices (tap the circle to mark the correct one)</span>
            {options.map((o, k) => (
              <div key={k} className={`wse-option${k === correct ? ' is-correct' : ''}`}>
                <label className="wse-radio" title={o === '' ? 'Write the choice first' : 'Mark as the correct answer'}>
                  <input type="radio" name={`correct-${it.id}`} aria-label={`Choice ${k + 1} is the correct answer`} disabled={o === ''} checked={k === correct} onChange={() => props.onChange({ answer: o })} />
                </label>
                <div className="wse-option-text">
                  <GrowField
                    single
                    inputRef={{
                      get current() {
                        return optionRefs.current[k] ?? null;
                      },
                      set current(v) {
                        optionRefs.current[k] = v;
                      },
                    }}
                    label={`Choice ${k + 1} of question ${n}`}
                    placeholder={`Choice ${k + 1}`}
                    value={o}
                    onChange={(v) => setOption(k, v)}
                    onEnter={addOption}
                  />
                </div>
                <button type="button" className="wse-icon" aria-label={`Remove choice ${k + 1} of question ${n}`} disabled={options.length <= 2} onClick={() => removeOption(k)}>
                  <Icon name="close" size="1.1rem" />
                </button>
              </div>
            ))}
            <button type="button" className="wse-small" onClick={addOption}>
              <Icon name="plus" size="1rem" /> Add choice
            </button>
            <p className={`wse-status${correct === -1 ? ' is-warn' : ''}`} role="status">
              {correct === -1 ? 'No correct answer marked yet.' : `Correct answer: ${options[correct]}`}
            </p>
          </div>
          <Field label="Why (optional)" hint="Shown beside the answer in the answer key.">
            <GrowField single label={`Explanation for question ${n}`} value={it.why} onChange={(why) => props.onChange({ why })} />
          </Field>
        </>
      )}

      {it.kind === 'phrase' && (
        <>
          <Field label="Phrase to translate" hint="What the student is given.">
            <GrowField inputRef={firstField} single label={`Phrase to translate in question ${n}`} value={it.phrase.en} placeholder="Example: Where is the station?" onChange={(en) => props.onChange({ en })} />
          </Field>
          <Field label="Answer in Interslavic" hint="Only in the answer key.">
            <GrowField single lang="isv" label={`Interslavic answer to question ${n}`} value={it.phrase.isv} placeholder="Its Interslavic" onChange={(isv) => props.onChange({ isv })} />
          </Field>
          <Field label="Note (optional)" hint="Shown in brackets after the phrase.">
            <GrowField single label={`Note for question ${n}`} value={it.phrase.note ?? ''} onChange={(note) => props.onChange({ note })} />
          </Field>
        </>
      )}

      {it.kind === 'table' && (
        <>
          <Field label="Table title">
            <GrowField single label={`Caption of table ${n}`} value={it.caption} onChange={(caption) => props.onChange({ caption })} />
          </Field>
          <p className="wse-hint">
            An inflection table with {it.rows.length} rows and {it.head.length} columns. The student fills in the cells; the forms are in the answer key. Its cells cannot be edited here.
          </p>
        </>
      )}

      <div className="wse-actions" role="group" aria-label={`Actions for question ${n}`}>
        <button type="button" className="wse-act" aria-label={`Move question ${n} earlier`} disabled={props.first} onClick={move(-1)}>
          <Icon name="arrowUp" size="1.1rem" /> Up
        </button>
        <button type="button" className="wse-act" aria-label={`Move question ${n} later`} disabled={props.last} onClick={move(1)}>
          <Icon name="arrowDown" size="1.1rem" /> Down
        </button>
        <button type="button" className="wse-act" aria-label={`Duplicate question ${n}`} onClick={props.onDuplicate}>
          <Icon name="copy" size="1.1rem" /> Copy
        </button>
        <button type="button" className="wse-act is-danger" aria-label={`Delete question ${n}`} onClick={props.onDelete}>
          <Icon name="trash" size="1.1rem" /> Delete
        </button>
        {it.edited && (
          <button type="button" className="wse-act" aria-label={`Put question ${n} back as it was`} onClick={props.onReset}>
            Put back
          </button>
        )}
      </div>
    </article>
  );
}

export interface WorksheetEditorProps {
  sheet: SheetSection[];
  setDraft: (f: (d: Draft) => Draft) => void;
  draft: Draft;
  title: string;
  onTitle: (t: string) => void;
  keyOn: boolean;
  onKey: (on: boolean) => void;
  count: number;
}

export function WorksheetEditor(props: WorksheetEditorProps) {
  const { sheet, draft, setDraft } = props;
  const kb = useKeyboardInset();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ n: number; text: string; undo: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const target = sheet.some((s) => s.key === targetKey) ? targetKey! : (sheet[sheet.length - 1]?.key ?? 'Exercises');
  const targetTitle = sheet.find((s) => s.key === target)?.title ?? target;

  const say = (text: string, undo: () => void) => setToast({ n: Date.now(), text, undo });

  const add = (kind: CustomKind) => {
    const r = addCustom(draft, target, kind);
    setDraft(() => r.draft);
    setFocusId(r.id);
    setClosed((c) => ({ ...c, [target]: false }));
    setMenuOpen(false);
  };

  const keyboardUp = kb > 0;

  return (
    <div className="wse" style={{ paddingBottom: kb }}>
      <section className="wse-settings" aria-label="Sheet settings">
        <button type="button" className="wse-fold" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
          <Icon name={settingsOpen ? 'chevronDown' : 'chevronRight'} size="1.1rem" />
          <span className="wse-fold-text">
            <strong>Sheet settings</strong>
            <span className="wse-hint">
              {props.title || 'Untitled'} · answer key {props.keyOn ? 'on' : 'off'}
            </span>
          </span>
        </button>
        {settingsOpen && (
          <div className="wse-settings-body">
            <Field label="Title of the worksheet">
              <GrowField single label="Worksheet title" value={props.title} onChange={props.onTitle} />
            </Field>
            <button type="button" className={`wse-switch${props.keyOn ? ' is-on' : ''}`} role="switch" aria-checked={props.keyOn} aria-label="Add an answer key on a new page" onClick={() => props.onKey(!props.keyOn)}>
              <Icon name="check" size="1.1rem" /> {props.keyOn ? 'Answer key on' : 'Answer key off'}
            </button>
            <p className="wse-status" role="status">
              {props.count === 0 ? 'Nothing on the worksheet yet.' : `${props.count} ${props.count === 1 ? 'question' : 'questions'} on the worksheet.`}
            </p>
            {draft.removed.length > 0 && (
              <button type="button" className="wse-wide" onClick={() => setDraft(restoreRemoved)}>
                Bring back {draft.removed.length} removed {draft.removed.length === 1 ? 'question' : 'questions'}
              </button>
            )}
            {(hasChanges(draft) || draft.removed.length > 0) &&
              (confirmReset ? (
                <div className="wse-row">
                  <button
                    type="button"
                    className="wse-wide is-danger"
                    onClick={() => {
                      setDraft(() => emptyDraft());
                      setConfirmReset(false);
                    }}
                  >
                    Discard my changes
                  </button>
                  <button type="button" className="wse-wide" onClick={() => setConfirmReset(false)}>
                    Keep them
                  </button>
                </div>
              ) : (
                <button type="button" className="wse-wide" onClick={() => setConfirmReset(true)}>
                  Start over
                </button>
              ))}
            <p className="wse-hint">Write ___ for a blank and **two stars** around a word to make it bold. Questions you change or write are marked Yours; nothing has checked them.</p>
          </div>
        )}
      </section>

      {sheet.length === 0 && <p className="wse-empty">No questions yet. Pick topics, or tap Add question to write your own.</p>}

      {sheet.map((s) => {
        const open = !closed[s.key];
        return (
          <section key={s.key} className="wse-group" aria-label={s.title || 'Section'}>
            <button type="button" className="wse-fold is-group" aria-expanded={open} onClick={() => setClosed((c) => ({ ...c, [s.key]: open }))}>
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size="1.1rem" />
              <span className="wse-fold-text">
                <strong>{s.title || 'Untitled section'}</strong>
                <span className="wse-hint">
                  {s.items.length} {s.items.length === 1 ? 'question' : 'questions'}
                </span>
              </span>
            </button>
            {open && (
              <div className="wse-group-body" onFocusCapture={() => setTargetKey(s.key)}>
                <Field label="Section title">
                  <GrowField single label={`Title of section ${s.key}`} value={s.title} placeholder="Section title" onChange={(t) => setDraft((d) => setSectionText(d, s.key, { title: t }))} />
                </Field>
                <Field label="What the student should do">
                  <GrowField single label={`Instruction for section ${s.key}`} value={s.instruction} placeholder="Example: Fill in the blank." onChange={(t) => setDraft((d) => setSectionText(d, s.key, { instruction: t }))} />
                </Field>
                {s.custom && (
                  <button
                    type="button"
                    className="wse-small is-danger"
                    onClick={() => {
                      const snap = snapshotSection(draft, s.key);
                      setDraft((d) => removeSection(d, s.key));
                      if (snap) say(`Section "${s.title}" deleted`, () => setDraft((d) => restoreSection(d, snap)));
                    }}
                  >
                    <Icon name="trash" size="1rem" /> Delete this section
                  </button>
                )}
                {s.items.map((item, i) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    first={i === 0}
                    last={i === s.items.length - 1}
                    autoFocus={focusId === item.id}
                    onChange={(p) => setDraft((d) => (item.custom ? patchCustom(d, item.id, p) : setPatch(d, item.id, p)))}
                    onReset={() => setDraft((d) => resetItem(d, item.id))}
                    onMove={(by) =>
                      setDraft((d) =>
                        moveItem(
                          d,
                          s.key,
                          s.items.map((x) => x.id),
                          item.id,
                          by,
                        ),
                      )
                    }
                    onDuplicate={() => {
                      const r = duplicateItem(
                        draft,
                        s.key,
                        s.items.map((x) => x.id),
                        item,
                      );
                      setDraft(() => r.draft);
                      setFocusId(r.id);
                    }}
                    onDelete={() => {
                      const snap = snapshotItem(draft, item.id, s.key);
                      setDraft((d) => removeItem(d, item.id));
                      say(`Question ${item.number} deleted`, () => setDraft((d) => restoreItem(d, snap)));
                    }}
                  />
                ))}
                {s.items.length === 0 && <p className="wse-empty">This section has no questions yet.</p>}
              </div>
            )}
          </section>
        );
      })}

      <button
        type="button"
        className="wse-wide"
        onClick={() => {
          const r = addSection(draft);
          setDraft(() => r.draft);
          setTargetKey(r.id);
        }}
      >
        <Icon name="plus" size="1.1rem" /> Add a section
      </button>

      <div className={`wse-bar${keyboardUp ? ' is-hidden' : ''}`}>
        {toast && (
          <div className="wse-toast" role="status" key={toast.n}>
            <span>{toast.text}</span>
            <button
              type="button"
              className="wse-undo"
              onClick={() => {
                toast.undo();
                setToast(null);
              }}
            >
              Undo
            </button>
          </div>
        )}
        {menuOpen && (
          <div className="wse-menu" role="menu" aria-label="Kind of question">
            {sheet.length > 1 && (
              <label className="wse-menu-target">
                <span className="wse-label">Add to</span>
                <select aria-label="Add to section" value={target} onChange={(e) => setTargetKey(e.target.value)}>
                  {sheet.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title || 'Untitled section'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sheet.length === 1 && <p className="wse-hint">Adding to "{targetTitle}"</p>}
            {ADD_KINDS.map((k) => (
              <button key={k.kind} type="button" role="menuitem" className="wse-menu-item" onClick={() => add(k.kind)}>
                <strong>{k.label}</strong>
                <span className="wse-hint">{k.help}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="wse-add" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'close' : 'plus'} size="1.2rem" /> Add question
        </button>
      </div>
    </div>
  );
}
