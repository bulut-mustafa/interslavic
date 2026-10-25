// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App.tsx';
import type { Translation } from '../../engine/src/pipeline.ts';

/**
 * The UI's whole purpose is to show where the engine is guessing, so these
 * tests check that the confidence actually reaches the DOM. A screenshot can
 * confirm it looks right; only a test can confirm a "guess" is not silently
 * rendered as a certainty.
 */

const sentence = (overrides: Partial<Translation> = {}): Translation => ({
  source: 'The woman read a book.',
  lang: 'en',
  text: 'Žena čitala knigu.',
  validationRate: 1,
  citations: {
    'case.deprel.nsubj': {
      tier: 'corpus',
      source: 'corpus: van Steenbergen\u2019s parallel texts',
      quote: null,
      why: 'a subject takes the nominative',
    },
    'aspect.default.imp': {
      tier: 'normative',
      source: 'http://steen.free.fr/interslavic/verbs.html',
      quote: 'Using the present tense of a perfective verb for the future is rather to be avoided.',
      why: 'the imperfective is the safe default',
    },
    'case.deprel.obj': {
      tier: 'corpus',
      source: 'corpus: the Interslavic Wikipedia',
      quote: null,
      why: 'a direct object takes the accusative',
    },
  },
  dropped: [{ form: 'The', why: 'Interslavic has no articles' }],
  unknown: [],
  words: [
    {
      surface: 'žena',
      lemma: 'žena',
      sourceForm: 'woman',
      pos: 'f.',
      validation: 'validated',
      notes: [],
      features: [
        {
          name: 'Case',
          value: 'Nom',
          ruleId: 'case.deprel.nsubj',
          because: 'subject (nsubj)',
          confidence: 'certain',
          alternatives: [],
        },
      ],
    },
    {
      surface: 'čitala',
      lemma: 'čitati',
      sourceForm: 'read',
      pos: 'v.tr. ipf.',
      validation: 'validated',
      notes: [],
      aspect: { chosen: 'Imp', because: 'no aspect cue found', declined: ['aspect.copy'] },
      features: [
        {
          name: 'Aspect',
          value: 'Imp',
          ruleId: 'aspect.default.imp',
          because: 'no aspect cue found - defaulting to imperfective',
          confidence: 'guess',
          alternatives: [{ value: 'Perf', because: 'possible if the action is completed' }],
        },
      ],
    },
    {
      surface: 'knigu',
      lemma: 'kniga',
      sourceForm: 'book',
      pos: 'f.',
      validation: 'unvalidated',
      notes: ['NOT FOUND in the full-form lexicon'],
      features: [
        {
          name: 'Case',
          value: 'Acc',
          ruleId: 'case.deprel.obj',
          because: 'direct object default',
          confidence: 'default',
          alternatives: [],
        },
      ],
    },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sentences: [sentence()] }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * The panel shows ONE word at a time, so a test about a particular word's
 * reasoning has to select that word first.
 *
 * This is why several tests below changed shape when the analysis stopped
 * being a list of every word. The contracts they check did not change - the
 * confidence still has to reach the DOM, a guess still must not render as a
 * certainty - only the path to them did. The sentence is the index: every word
 * in the output line is a button.
 */
async function selectWord(container: HTMLElement, surface: string) {
  const button = [...container.querySelectorAll('.output-word')].find(
    (b) => b.textContent === surface,
  );
  if (!button) throw new Error(`no word button for "${surface}"`);
  await act(async () => {
    fireEvent.click(button);
  });
}

/**
 * Ready means the words AND the panel, not just the words. Waiting on the word
 * buttons alone made the stepper test fail about one run in three: the panel
 * used to be selected by an effect, so there was a render where the sentence
 * existed and the panel did not.
 */
const settled = (container: HTMLElement) =>
  waitFor(
    () => {
      expect(container.querySelectorAll('.output-word').length).toBe(3);
      expect(container.querySelector('.entry')).not.toBeNull();
    },
    { timeout: 3000 },
  );

describe('translator UI', () => {
  it('renders the translation', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('žena').length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });

  it('carries each confidence level into the DOM', async () => {
    const { container } = render(<App />);
    await settled(container);

    // Collected across the whole sentence, one word at a time. Stepping through
    // every word is a stronger check than the old single sweep: it proves both
    // that the attribute is set AND that selecting a word changes the panel.
    const levels: (string | null)[] = [];
    for (const surface of ['Žena', 'čitala', 'knigu']) {
      await selectWord(container, surface);
      levels.push(
        ...[...container.querySelectorAll('.feature')].map((el) =>
          el.getAttribute('data-confidence'),
        ),
      );
    }
    // The rail is driven by this attribute; without it every line looks equally sure.
    expect(levels).toContain('certain');
    expect(levels).toContain('guess');
    expect(levels).toContain('default');
  });

  it('explains the reason beside each feature, not just the value', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/subject \(nsubj\)/)).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('shows feature values in words a learner would use', async () => {
    // "Nom" is not a word anyone says out loud.
    const { container } = render(<App />);
    await settled(container);
    // žena is selected on arrival, so its nominative is already showing.
    expect(screen.getByText('nominative')).toBeTruthy();
    await selectWord(container, 'knigu');
    expect(screen.getByText('accusative')).toBeTruthy();
  });

  it('offers the alternative when the engine guessed', async () => {
    const { container } = render(<App />);
    await settled(container);
    await selectWord(container, 'čitala');
    expect(screen.getByText(/could also be perfective/)).toBeTruthy();
  });

  it('marks an unverified word in the output and lists it', async () => {
    const { container } = render(<App />);
    // The output line flags it without anything being selected, which is the
    // point: a reader should see there is a doubt before they go looking.
    await waitFor(() => expect(container.querySelectorAll('.is-flagged').length).toBe(1), {
      timeout: 3000,
    });
    expect(screen.getByText(/may not be a real form/)).toBeTruthy();

    await selectWord(container, 'knigu');
    expect(screen.getAllByText('unverified').length).toBe(1);
  });

  /**
   * The panel is never empty. Showing one word at a time only works if the
   * first one is already chosen - an empty panel under a heading reading "Why
   * this word" is a dead end, and nothing would tell the reader that the words
   * above are clickable.
   */
  it('selects the first word on arrival, so the panel is never empty', async () => {
    const { container } = render(<App />);
    await settled(container);
    expect(container.querySelectorAll('.entry').length).toBe(1);
    expect(container.querySelector('.entry-form')?.textContent).toBe('žena');
    expect(container.querySelectorAll('.output-word.is-active').length).toBe(1);
    expect(container.querySelector('.stepper-count')?.textContent).toBe('1 of 3');
  });

  /**
   * prev / next walks the sentence, which is how someone actually reads one:
   * word by word, rather than hunting for the next target with a mouse.
   */
  it('steps through the sentence with prev and next', async () => {
    const { container } = render(<App />);
    await settled(container);

    // `disabled` read off the element rather than via jest-dom's matcher: this
    // project has no test setup file, and one assertion is not a reason for one.
    const prev = screen.getByLabelText('Previous word') as HTMLButtonElement;
    const next = screen.getByLabelText('Next word') as HTMLButtonElement;

    // At the first word there is nothing before it.
    expect(prev.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(next);
    });
    expect(container.querySelector('.entry-form')?.textContent).toBe('čitala');
    expect(container.querySelector('.stepper-count')?.textContent).toBe('2 of 3');
    expect(prev.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(next);
    });
    expect(container.querySelector('.entry-form')?.textContent).toBe('knigu');
    // And nothing after the last.
    expect(next.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(prev);
    });
    expect(container.querySelector('.entry-form')?.textContent).toBe('čitala');
  });

  it('reports the lexicon check as a count', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/of 3 words found in the lexicon/)).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('says why a word was left out', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/no articles/)).toBeTruthy(), { timeout: 3000 });
  });

  it('shows the other script alongside the chosen one', async () => {
    // Latin and Cyrillic map 1:1, which is the defining fact about written
    // Interslavic, so the alternate is always on screen.
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.alt-script')).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('tells the reader how to start the services when they are down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: 'could not reach the parser service at ...' }),
      })),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText(/npm run parser/)).toBeTruthy(), {
      timeout: 3000,
    });
  });
});

describe('the output line reads as a sentence', () => {
  // Adjacent JSX elements carry no whitespace, so mapping words straight to
  // buttons rendered "kakběšetydělaje" as one run of letters.
  it('puts spaces between the words', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.output')).toBeTruthy(), {
      timeout: 3000,
    });
    // ...and the capital the sentence starts with: the words are bare forms.
    expect(container.querySelector('.output')?.textContent).toBe('Žena čitala knigu.');
  });

  it('keeps the sentence-final punctuation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          sentences: [sentence({ text: 'Kak ty dělaješ?' })],
        }),
      })),
    );
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.output')).toBeTruthy(), {
      timeout: 3000,
    });
    // The words themselves never carry punctuation; the sentence does.
    expect(container.querySelector('.output')?.textContent?.endsWith('?')).toBe(true);
  });

  it('still makes every word individually clickable', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll('.output-word').length).toBe(3), {
      timeout: 3000,
    });
  });
});

describe('what says so', () => {
  /**
   * The citation is the project's whole claim made visible. The reader is
   * already told how confident the engine is; this is what lets them check the
   * rule against van Steenbergen's own sentence instead of trusting us.
   */
  it('shows what says so, with the tier and the verbatim source', async () => {
    const { container } = render(<App />);
    await settled(container);

    // The two tiers sit on different words, so this walks the sentence.
    const tiers: (string | null)[] = [];
    for (const surface of ['Žena', 'čitala']) {
      await selectWord(container, surface);
      tiers.push(
        ...[...container.querySelectorAll('.citation > summary')].map((el) =>
          el.getAttribute('data-tier'),
        ),
      );
    }
    // A grammar page and attested usage are different kinds of claim, and the
    // reader can see which one they are getting.
    expect(tiers).toContain('normative');
    expect(tiers).toContain('corpus');

    // The verbatim quote is present, and marked as a quotation rather than
    // being folded into our own prose.
    const quote = container.querySelector('.citation-quote');
    expect(quote?.textContent ?? '').toMatch(/present tense of a perfective verb/);

    // And the source is reachable, not just named.
    const link = container.querySelector('a.citation-source');
    expect(link?.getAttribute('href') ?? '').toMatch(/steen\.free\.fr/);
  });

  /**
   * A rule with no recorded source is a bug the registry test catches. The
   * panel says so rather than rendering nothing, because silence here looks
   * exactly like a rule that needed no justification.
   */
  it('says plainly when a rule has no recorded source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sentences: [sentence({ citations: {} })] }),
      })),
    );
    const { container } = render(<App />);
    await waitFor(
      () => expect(container.querySelector('.citation-missing')).not.toBeNull(),
      { timeout: 3000 },
    );
    expect(container.querySelector('.citation-missing')?.textContent ?? '').toMatch(
      /no source recorded/,
    );
  });
});

/**
 * The language and script are tabs rather than dropdowns: every choice is on
 * screen, and the current one is marked. The request must carry what is
 * marked, or the bar would show one thing and translate another.
 */
describe('the language bar', () => {
  const lastBody = () => {
    const calls = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls;
    return JSON.parse(calls[calls.length - 1]![1].body) as { lang: string; orthography: string };
  };

  it('marks the current language and translates from the one clicked', async () => {
    const { container } = render(<App />);
    await settled(container);
    const russian = screen.getByRole('button', { name: 'Russian' });
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      fireEvent.click(russian);
    });
    expect(russian.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(lastBody().lang).toBe('ru'), { timeout: 3000 });
  });

  it('switches the script with one click', async () => {
    const calls = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls;
    const { container } = render(<App />);
    await settled(container);
    // Cyrillic is already requested as the quiet second line, so what proves
    // the switch is the MAIN request - the first one sent after the click.
    const before = calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cyrillic' }));
    });
    await waitFor(() => expect(calls.length).toBeGreaterThan(before), { timeout: 3000 });
    expect(JSON.parse(calls[before]![1].body).orthography).toBe('cyrillic');
    expect(screen.getByRole('button', { name: 'Cyrillic' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the input', async () => {
    const { container } = render(<App />);
    await settled(container);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Clear text'));
    });
    expect((screen.getByLabelText('Text to translate') as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByLabelText('Clear text')).toBeNull();
  });
});

/**
 * Testers report what is wrong from the page itself; the report carries the
 * sentence, our output and their comment, and nothing about them.
 */
describe('reporting a problem', () => {
  it('sends the sentence, the output and the comment', async () => {
    const calls = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls;
    const { container } = render(<App />);
    await settled(container);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
    });
    fireEvent.change(screen.getByLabelText('What is wrong?'), { target: { value: 'wrong ending' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    });
    const sent = calls.find(([url]) => url.endsWith('/api/feedback'));
    expect(sent).toBeDefined();
    const body = JSON.parse(sent![1].body);
    expect(body).toMatchObject({ source: 'The woman read a new book.', output: 'Žena čitala knigu.', comment: 'wrong ending' });
    await waitFor(() => expect(screen.getByText(/report was sent/)).toBeTruthy());
  });

  it('will not send an empty report', async () => {
    const { container } = render(<App />);
    await settled(container);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
    });
    expect((screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
