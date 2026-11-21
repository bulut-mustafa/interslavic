import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { Icon } from '../components/Icon.tsx';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import { Chip, ChipRow } from '../phone/parts.tsx';
import { WorksheetEditor } from '../phone/worksheets-edit.tsx';
import { useIsPhone } from '../phone/useIsPhone.ts';
import { toCyrillic } from '../../../morph/src/orthography.ts';
import { Text } from '../learn/Lesson.tsx';
import { LESSONS } from '../learn/lessons.ts';
import { PHRASEBOOK, sourceUrl } from '../learn/phrasebook.ts';
import { buildWorksheet, contributions, type Selection } from './build.ts';
import {
  addCustom,
  addSection,
  applyDraft,
  countSheet,
  emptyDraft,
  hasChanges,
  loadSaved,
  moveItem,
  patchCustom,
  removeItem,
  removeSection,
  resetItem,
  restoreRemoved,
  save,
  setPatch,
  setSectionText,
  type CustomKind,
  type Draft,
  type Patch,
  type SheetItem,
  type SheetSection,
} from './draft.ts';

/**
 * Printable worksheets for teachers: pick what to include, change any question
 * or answer or write your own, then print the page or save it as a PDF from the
 * browser's print dialog. The worksheet is the page itself (the controls and
 * the site around it are hidden when printing), so there is no second renderer
 * to keep in step. The ready-made questions come from the lessons and the
 * phrasebook; what a teacher changes or adds is theirs, is marked on screen as
 * such, and has not been checked by anything.
 */

const withExercises = LESSONS.filter((l) => contributions(l).exercises > 0);
const withTables = LESSONS.filter((l) => contributions(l).tables > 0);

const toggle = (list: string[], value: string): string[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

const STARTER: Selection = {
  exercises: withExercises.slice(0, 1).map((l) => l.slug),
  tables: [],
  phrases: PHRASEBOOK.slice(0, 1).map((g) => g.title),
};

const lines = (text: string): string[] => text.split('\n');

/** A box for words that grows with what is typed in it, so a question is never hidden behind a scroll bar. */
function Grow(props: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`ws-field ${props.className ?? ''}`}
      aria-label={props.label}
      placeholder={props.placeholder}
      spellCheck={false}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export default function Worksheets() {
  // What was open last time comes back; otherwise a first worksheet is already on the page, so there is something to see and change.
  const [saved] = useState(() => loadSaved());
  const [sel, setSel] = useState<Selection>(() => saved?.selection ?? STARTER);
  const [title, setTitle] = useState(saved?.title ?? 'Interslavic worksheet');
  const [key, setKey] = useState(saved?.key ?? true);
  const [draft, setDraft] = useState<Draft>(() => saved?.draft ?? emptyDraft());
  const [editing, setEditing] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const phone = useIsPhone();
  const [editSheet, setEditSheet] = useState<null | 'questions' | 'topics'>(null);

  useEffect(() => {
    const t = setTimeout(() => save({ draft, title, key, selection: sel }), 300);
    return () => clearTimeout(t);
  }, [draft, title, key, sel]);

  const built = useMemo(() => buildWorksheet(sel, LESSONS, PHRASEBOOK), [sel]);
  const sheet = useMemo(() => applyDraft(built, draft), [built, draft]);
  const count = countSheet(sheet);

  const everything: Selection = {
    exercises: withExercises.map((l) => l.slug),
    tables: withTables.map((l) => l.slug),
    phrases: PHRASEBOOK.map((g) => g.title),
  };

  const change = (item: SheetItem, p: Patch) => setDraft((d) => (item.custom ? patchCustom(d, item.id, p) : setPatch(d, item.id, p)));
  const add = (section: string, kind: CustomKind) =>
    setDraft((d) => {
      const r = addCustom(d, section, kind);
      setFocusId(r.id);
      return r.draft;
    });

  // The preview sits behind the sheet: while typing it follows at low priority, so a keystroke only pays for the editor.
  const shownSheet = useDeferredValue(sheet);
  const shownTitle = useDeferredValue(title);
  const phonePreview = useMemo(
    () => (
      <article className="worksheet" aria-label="Worksheet preview">
        <header className="worksheet-head">
          <h2>{shownTitle}</h2>
          <p className="worksheet-name">
            Name <span className="blank" /> Date <span className="blank" />
          </p>
        </header>
        {shownSheet.map((s) => (
          <SectionView
            key={s.key}
            section={s}
            editing={false}
            focusId={null}
            onText={() => undefined}
            onRemoveSection={() => undefined}
            onAdd={() => undefined}
            onChange={() => undefined}
            onRemove={() => undefined}
            onReset={() => undefined}
            onMove={() => undefined}
          />
        ))}
        <footer className="worksheet-foot">interslavic.web.app</footer>
        {key && (
          <section className="worksheet-answers">
            <h2>Answer key - {shownTitle}</h2>
            {shownSheet.map((s) => (
              <div key={s.key} className="worksheet-section">
                <h3>{s.title}</h3>
                <ol className="worksheet-items" start={s.items[0]?.number ?? 1}>
                  {s.items.map((item) => (
                    <li key={item.id} value={item.number}>
                      <Answer item={item} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}
      </article>
    ),
    [shownSheet, shownTitle, key],
  );

  if (phone) {
    const printNow = () => {
      track('worksheet-print', { items: count, key });
      window.print();
    };
    return (
      <div className="ph-tool-screen ph-ws">
        <div className={`ph-tool-scroll ph-paper-wrap${editSheet ? ' ph-sheet-open' : ''}`}>
          {count === 0 && sheet.length === 0 ? (
            <div className="ph-note-card">
              <strong>Nothing on the worksheet yet</strong>
              <span>Pick topics to include, or write a question yourself.</span>
              <button type="button" className="ph-secondary" onClick={() => setEditSheet('topics')}>
                Pick topics
              </button>
            </div>
          ) : (
            phonePreview
          )}
        </div>

        <div className="ph-tool-bar ph-tool-bar-split">
          <button type="button" className="ph-secondary" onClick={() => setEditSheet('questions')}>
            <Icon name="edit" /> Edit
          </button>
          <button type="button" className="ph-primary" disabled={count === 0} onClick={printNow}>
            <Icon name="print" /> Print or save PDF
          </button>
        </div>

        <BottomSheet
          open={editSheet !== null}
          onClose={() => setEditSheet(null)}
          title="Edit worksheet"
          detents={['half', 'full']}
          initialDetent={1}
          headerAction={
            <button type="button" className="ph-sheet-done" onClick={() => setEditSheet(null)}>
              Done
            </button>
          }
        >
          <div className="ph-sheet-stack">
            <ChipRow label="What to edit">
              <Chip selected={editSheet !== 'topics'} onClick={() => setEditSheet('questions')}>
                Questions
              </Chip>
              <Chip selected={editSheet === 'topics'} onClick={() => setEditSheet('topics')}>
                Topics
              </Chip>
            </ChipRow>

            {editSheet === 'topics' && (
              <>
                <div className="ph-sheet-row">
                  <button type="button" className="ph-secondary" onClick={() => setSel(everything)}>
                    Select everything
                  </button>
                  <button type="button" className="ph-secondary" onClick={() => setSel({ exercises: [], tables: [], phrases: [] })}>
                    Clear
                  </button>
                </div>
                <Picker
                  legend="Exercises from"
                  options={withExercises.map((l) => ({
                    value: l.slug,
                    label: l.title,
                    count: contributions(l).exercises,
                  }))}
                  chosen={sel.exercises}
                  onToggle={(v) => setSel({ ...sel, exercises: toggle(sel.exercises, v) })}
                />
                <Picker
                  legend="Inflection tables from"
                  options={withTables.map((l) => ({
                    value: l.slug,
                    label: l.title,
                    count: contributions(l).tables,
                  }))}
                  chosen={sel.tables}
                  onToggle={(v) => setSel({ ...sel, tables: toggle(sel.tables, v) })}
                />
                <Picker
                  legend="Phrases from"
                  options={PHRASEBOOK.map((g) => ({
                    value: g.title,
                    label: g.title,
                    count: g.phrases.length,
                  }))}
                  chosen={sel.phrases}
                  onToggle={(v) => setSel({ ...sel, phrases: toggle(sel.phrases, v) })}
                />
              </>
            )}
          </div>
          {editSheet !== 'topics' && <WorksheetEditor sheet={sheet} draft={draft} setDraft={setDraft} title={title} onTitle={setTitle} keyOn={key} onKey={setKey} count={count} />}
        </BottomSheet>
      </div>
    );
  }

  return (
    <main className="worksheets">
      <div className="editor">
        <div className="editor-stage">
          <div className="editor-bar worksheet-controls" role="toolbar" aria-label="Worksheet tools">
            <h1 className="tool-title">Worksheets</h1>
            <label className="worksheet-title">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <span className="sub-count" role="status">
              {count === 0 ? 'Nothing selected yet.' : `${count} ${count === 1 ? 'item' : 'items'} on the worksheet.`}
            </span>
            <span className="editor-gap" />
            <button type="button" className={`switch is-compact${editing ? ' is-on' : ''}`} role="switch" aria-checked={editing} aria-label="Edit questions" onClick={() => setEditing((e) => !e)}>
              <Icon name="edit" />
              <span>{editing ? 'Editing' : 'Preview'}</span>
            </button>
            <button type="button" className={`switch is-compact${key ? ' is-on' : ''}`} role="switch" aria-checked={key} aria-label="Add an answer key on a new page" onClick={() => setKey((k) => !k)}>
              <Icon name="check" />
              <span>{key ? 'Answer key on' : 'Answer key off'}</span>
            </button>
            <button
              type="button"
              className="text-button is-primary"
              disabled={count === 0}
              onClick={() => {
                track('worksheet-print', { items: count, key });
                window.print();
              }}
            >
              <Icon name="print" /> Print or save as PDF
            </button>
          </div>

          {(hasChanges(draft) || draft.removed.length > 0) && (
            <p className="note ws-bar-note ws-edit-only">
              Questions you change or write are marked <span className="ws-badge">yours</span>: they have not been checked against the lessons, so read them over before you print.{' '}
              {draft.removed.length > 0 && (
                <button type="button" className="text-button" onClick={() => setDraft(restoreRemoved)}>
                  Bring back {draft.removed.length} removed {draft.removed.length === 1 ? 'question' : 'questions'}
                </button>
              )}{' '}
              {confirmReset ? (
                <>
                  Discard every change you made?{' '}
                  <button
                    type="button"
                    className="text-button is-primary"
                    onClick={() => {
                      setDraft(emptyDraft());
                      setConfirmReset(false);
                    }}
                  >
                    Discard them
                  </button>{' '}
                  <button type="button" className="text-button" onClick={() => setConfirmReset(false)}>
                    Keep them
                  </button>
                </>
              ) : (
                <button type="button" className="text-button" onClick={() => setConfirmReset(true)}>
                  Start over
                </button>
              )}
            </p>
          )}

          {count === 0 && !editing ? (
            <p className="note">Pick topics on the right and the worksheet appears here.</p>
          ) : count === 0 && sheet.length === 0 ? (
            <div className="note ws-empty-start">
              <p>Pick topics on the right, or start from nothing.</p>
              <button type="button" className="text-button" onClick={() => add('Exercises', 'question')}>
                Write a question
              </button>
            </div>
          ) : (
            <article className="worksheet" aria-label="Worksheet preview">
              <header className="worksheet-head">
                <h2>{title}</h2>
                <p className="worksheet-name">
                  Name <span className="blank" /> Date <span className="blank" />
                </p>
              </header>
              {sheet.map((s) => (
                <SectionView
                  key={s.key}
                  section={s}
                  editing={editing}
                  focusId={focusId}
                  onText={(t) => setDraft((d) => setSectionText(d, s.key, t))}
                  onRemoveSection={() => setDraft((d) => removeSection(d, s.key))}
                  onAdd={(kind) => add(s.key, kind)}
                  onChange={change}
                  onRemove={(it) => setDraft((d) => removeItem(d, it.id))}
                  onReset={(it) => setDraft((d) => resetItem(d, it.id))}
                  onMove={(it, by) =>
                    setDraft((d) =>
                      moveItem(
                        d,
                        s.key,
                        s.items.map((x) => x.id),
                        it.id,
                        by,
                      ),
                    )
                  }
                />
              ))}
              {editing && (
                <button
                  type="button"
                  className="text-button ws-edit-only ws-add-section"
                  onClick={() =>
                    setDraft((d) => {
                      const r = addSection(d);
                      setFocusId(r.id);
                      return r.draft;
                    })
                  }
                >
                  <Icon name="plus" /> Add a section
                </button>
              )}
              <footer className="worksheet-foot">interslavic.web.app</footer>

              {key && (
                <section className="worksheet-answers">
                  <h2>Answer key - {title}</h2>
                  {sheet.map((s) => (
                    <div key={s.key} className="worksheet-section">
                      <h3>{s.title}</h3>
                      <ol className="worksheet-items" start={s.items[0]?.number ?? 1}>
                        {s.items.map((item) => (
                          <li key={item.id} value={item.number}>
                            <Answer item={item} />
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  {sheet.some((s) => s.items.some((i) => i.kind === 'phrase' && i.phrase.source !== 'custom')) && (
                    <p className="worksheet-credits">Phrases are from the Interslavic dictionary (non-commercial use) or from Tatoeba sentences under CC BY 2.0 FR, numbered above.</p>
                  )}
                </section>
              )}
            </article>
          )}
        </div>

        <aside className="editor-side worksheet-picks" aria-label="What to include">
          <div className="insp-line">
            <button type="button" className="text-button" onClick={() => setSel(everything)}>
              Select everything
            </button>
            <button type="button" className="text-button" onClick={() => setSel({ exercises: [], tables: [], phrases: [] })}>
              Clear
            </button>
          </div>
          <Picker
            legend="Exercises from"
            options={withExercises.map((l) => ({
              value: l.slug,
              label: l.title,
              count: contributions(l).exercises,
            }))}
            chosen={sel.exercises}
            onToggle={(v) => setSel({ ...sel, exercises: toggle(sel.exercises, v) })}
          />
          <Picker
            legend="Inflection tables from"
            options={withTables.map((l) => ({
              value: l.slug,
              label: l.title,
              count: contributions(l).tables,
            }))}
            chosen={sel.tables}
            onToggle={(v) => setSel({ ...sel, tables: toggle(sel.tables, v) })}
          />
          <Picker
            legend="Phrases from"
            options={PHRASEBOOK.map((g) => ({
              value: g.title,
              label: g.title,
              count: g.phrases.length,
            }))}
            chosen={sel.phrases}
            onToggle={(v) => setSel({ ...sel, phrases: toggle(sel.phrases, v) })}
          />
          <p className="note">
            The ready-made questions are exercises and tables from the lessons and phrases from the phrasebook, so their answers are the ones the lessons already check. Change any of them, or write
            your own, on the page itself. In a question, write ___ for a blank and **two stars** around a word to make it bold.
          </p>
        </aside>
      </div>
    </main>
  );
}

const KIND_LABEL: Record<SheetItem['kind'], string> = {
  fill: 'Question',
  choice: 'Multiple choice',
  phrase: 'Translate',
  table: 'Table',
};

function SectionView(props: {
  section: SheetSection;
  editing: boolean;
  focusId: string | null;
  onText: (t: { title?: string; instruction?: string }) => void;
  onRemoveSection: () => void;
  onAdd: (kind: CustomKind) => void;
  onChange: (item: SheetItem, p: Patch) => void;
  onRemove: (item: SheetItem) => void;
  onReset: (item: SheetItem) => void;
  onMove: (item: SheetItem, by: -1 | 1) => void;
}) {
  const { section: s, editing } = props;
  return (
    <section className="worksheet-section">
      {editing ? (
        <div className="ws-editor ws-section-edit">
          <input className="ws-field ws-h3" aria-label={`Title of section ${s.title}`} value={s.title} placeholder="Section title" onChange={(e) => props.onText({ title: e.target.value })} />
          <input
            className="ws-field ws-instruction"
            aria-label={`Instruction for ${s.title}`}
            value={s.instruction}
            placeholder="What the student should do"
            onChange={(e) => props.onText({ instruction: e.target.value })}
          />
          {s.custom && (
            <button type="button" className="icon-button ws-edit-only" aria-label={`Remove the section ${s.title}`} title="Remove this section" onClick={props.onRemoveSection}>
              <Icon name="trash" size="0.9rem" />
            </button>
          )}
        </div>
      ) : null}
      <div className={editing ? 'ws-static' : undefined}>
        <h3>{s.title}</h3>
        {s.instruction && <p className="worksheet-instruction">{s.instruction}</p>}
      </div>
      <ol className="worksheet-items" start={s.items[0]?.number ?? 1}>
        {s.items.map((item, i) => (
          <li key={item.id} value={item.number} className={item.custom || item.edited ? 'is-mine' : undefined}>
            {editing && (
              <ItemEditor
                item={item}
                first={i === 0}
                last={i === s.items.length - 1}
                autoFocus={props.focusId === item.id}
                onChange={(p) => props.onChange(item, p)}
                onRemove={() => props.onRemove(item)}
                onReset={() => props.onReset(item)}
                onMove={(by) => props.onMove(item, by)}
              />
            )}
            <div className={editing ? 'ws-static' : undefined}>
              <Question item={item} />
            </div>
          </li>
        ))}
      </ol>
      {editing && (
        <div className="ws-adders ws-edit-only" role="group" aria-label={`Add to ${s.title}`}>
          <button type="button" className="text-button" onClick={() => props.onAdd('question')}>
            <Icon name="plus" /> Question
          </button>
          <button type="button" className="text-button" onClick={() => props.onAdd('choice')}>
            <Icon name="plus" /> Multiple choice
          </button>
          <button type="button" className="text-button" onClick={() => props.onAdd('translate')}>
            <Icon name="plus" /> Phrase to translate
          </button>
        </div>
      )}
    </section>
  );
}

/** The fields of one question, on the page itself, with what can be done to it. Hidden when printing, where the question stands as it will be handed out. */
function ItemEditor(props: {
  item: SheetItem;
  first: boolean;
  last: boolean;
  autoFocus: boolean;
  onChange: (p: Patch) => void;
  onRemove: () => void;
  onReset: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const { item: it } = props;
  const n = it.number;
  const first = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => {
    if (props.autoFocus) first.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ws-editor ws-item-edit">
      <div className="ws-item-head">
        <span className="ws-kind">{KIND_LABEL[it.kind]}</span>
        {(it.custom || it.edited) && <span className="ws-badge">yours</span>}
        <span className="editor-gap" />
        <button type="button" className="icon-button" aria-label={`Move question ${n} earlier`} title="Move earlier" disabled={props.first} onClick={() => props.onMove(-1)}>
          <Icon name="arrowUp" size="0.9rem" />
        </button>
        <button type="button" className="icon-button" aria-label={`Move question ${n} later`} title="Move later" disabled={props.last} onClick={() => props.onMove(1)}>
          <Icon name="arrowDown" size="0.9rem" />
        </button>
        {it.edited && (
          <button type="button" className="text-button" aria-label={`Put question ${n} back as it was`} onClick={props.onReset}>
            Put back
          </button>
        )}
        <button type="button" className="icon-button" aria-label={`Remove question ${n}`} title="Remove this question" onClick={props.onRemove}>
          <Icon name="trash" size="0.9rem" />
        </button>
      </div>

      {it.kind === 'fill' && (
        <>
          <Grow label={`Question ${n}`} value={it.prompt} placeholder="Write the question. Use ___ for a blank." onChange={(prompt) => props.onChange({ prompt })} className="ws-prompt" />
          <label className="ws-row ws-top">
            <span>Answer</span>
            <Grow
              label={`Answer to question ${n}`}
              value={it.answers.join('\n')}
              placeholder="The answer. If more than one is correct, put each on its own line."
              onChange={(v) => props.onChange({ answers: lines(v) })}
            />
          </label>
          <label className="ws-row">
            <span>Why</span>
            <input
              className="ws-field"
              aria-label={`Explanation for question ${n}`}
              placeholder="Optional: shown beside the answer in the key"
              value={it.why}
              onChange={(e) => props.onChange({ why: e.target.value })}
            />
          </label>
        </>
      )}

      {it.kind === 'choice' && (
        <>
          <Grow label={`Question ${n}`} value={it.prompt} placeholder="Write the question" onChange={(prompt) => props.onChange({ prompt })} className="ws-prompt" />
          <label className="ws-row ws-top">
            <span>Choices</span>
            <Grow label={`Choices for question ${n}`} value={it.options.join('\n')} placeholder="One choice on each line" onChange={(v) => props.onChange({ options: lines(v) })} />
          </label>
          <label className="ws-row">
            <span>Right one</span>
            <select
              className="ws-field"
              aria-label={`Right answer to question ${n}`}
              value={it.options.includes(it.answer) ? it.answer : ''}
              onChange={(e) => props.onChange({ answer: e.target.value })}
            >
              <option value="">Choose…</option>
              {it.options
                .filter((o) => o.trim() !== '')
                .map((o, k) => (
                  <option key={`${o}${k}`} value={o}>
                    {o}
                  </option>
                ))}
            </select>
          </label>
          <label className="ws-row">
            <span>Why</span>
            <input
              className="ws-field"
              aria-label={`Explanation for question ${n}`}
              placeholder="Optional: shown beside the answer in the key"
              value={it.why}
              onChange={(e) => props.onChange({ why: e.target.value })}
            />
          </label>
        </>
      )}

      {it.kind === 'phrase' && (
        <>
          <label className="ws-row">
            <span>To translate</span>
            <input
              ref={first as React.RefObject<HTMLInputElement>}
              className="ws-field"
              aria-label={`Phrase to translate in question ${n}`}
              placeholder="The phrase the student is given"
              value={it.phrase.en}
              onChange={(e) => props.onChange({ en: e.target.value })}
            />
          </label>
          <label className="ws-row">
            <span>Answer</span>
            <input
              className="ws-field"
              lang="isv"
              aria-label={`Interslavic answer to question ${n}`}
              placeholder="Its Interslavic"
              value={it.phrase.isv}
              onChange={(e) => props.onChange({ isv: e.target.value })}
            />
          </label>
          <label className="ws-row">
            <span>Note</span>
            <input
              className="ws-field"
              aria-label={`Note for question ${n}`}
              placeholder="Optional: shown in brackets after the phrase"
              value={it.phrase.note ?? ''}
              onChange={(e) => props.onChange({ note: e.target.value })}
            />
          </label>
        </>
      )}

      {it.kind === 'table' && (
        <label className="ws-row">
          <span>Caption</span>
          <input className="ws-field" aria-label={`Caption of table ${n}`} value={it.caption} onChange={(e) => props.onChange({ caption: e.target.value })} />
        </label>
      )}
    </div>
  );
}

function Picker(props: { legend: string; options: { value: string; label: string; count: number }[]; chosen: string[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="worksheet-picker">
      <legend>{props.legend}</legend>
      <div className="worksheet-chips">
        {props.options.map((o) => (
          <label key={o.value} className={`topic-chip${props.chosen.includes(o.value) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={props.chosen.includes(o.value)} onChange={() => props.onToggle(o.value)} />
            <span>
              {o.label} <span className="worksheet-n">({o.count})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Question({ item }: { item: SheetItem }) {
  switch (item.kind) {
    case 'fill':
      if (item.prompt.trim() === '') return <p className="ws-empty">(no question written yet)</p>;
      return (
        <p>
          <Text text={item.prompt} />
          {/* A prompt with its own ___ is answered in place; any other needs a line to write on. */}
          {!item.prompt.includes('___') && <span className="blank wide" />}
        </p>
      );
    case 'choice':
      if (item.prompt.trim() === '') return <p className="ws-empty">(no question written yet)</p>;
      return (
        <>
          <p>
            <Text text={item.prompt} />
          </p>
          <p className="worksheet-options">
            {item.options
              .filter((o) => o.trim() !== '')
              .map((o, k) => (
                <span key={`${o}${k}`} className="worksheet-option">
                  ○ {o}
                </span>
              ))}
          </p>
        </>
      );
    case 'phrase':
      if (item.phrase.en.trim() === '') return <p className="ws-empty">(no phrase written yet)</p>;
      return (
        <p>
          {item.phrase.en}
          {item.phrase.note && <span className="phrase-note"> ({item.phrase.note})</span>}
          <span className="blank wide" />
        </p>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table>
            <caption>{item.caption}</caption>
            <thead>
              <tr>
                {item.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.forms.map((_, c) => (
                    <td key={c} className="worksheet-cell" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Answer({ item }: { item: SheetItem }) {
  switch (item.kind) {
    case 'fill': {
      const answers = item.answers.filter((x) => x.trim() !== '');
      return (
        <p>
          {answers.length === 0 ? <span className="ws-empty">(no answer written yet)</span> : <strong lang="isv">{answers.join(' / ')}</strong>}
          {item.why.trim() !== '' && (
            <>
              {' '}
              - <Text text={item.why} />
            </>
          )}
        </p>
      );
    }
    case 'choice':
      return (
        <p>
          {item.answer.trim() === '' ? <span className="ws-empty">(no right answer chosen yet)</span> : <strong>{item.answer}</strong>}
          {item.why.trim() !== '' && (
            <>
              {' '}
              - <Text text={item.why} />
            </>
          )}
        </p>
      );
    case 'phrase':
      return (
        <p>
          {item.phrase.isv.trim() === '' ? (
            <span className="ws-empty">(no answer written yet)</span>
          ) : (
            <>
              <strong lang="isv">{item.phrase.isv}</strong>{' '}
              <span lang="isv-Cyrl" className="worksheet-cyr">
                {toCyrillic(item.phrase.isv)}
              </span>
            </>
          )}{' '}
          {item.phrase.source !== 'custom' && (
            <a className="phrase-source" href={sourceUrl(item.phrase.source)}>
              {item.phrase.source === 'dictionary' ? 'dictionary' : `Tatoeba ${item.phrase.source}`}
            </a>
          )}
        </p>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table>
            <caption>{item.caption}</caption>
            <thead>
              <tr>
                {item.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.forms.map((f, c) => (
                    <td key={c} lang="isv">
                      {f}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
