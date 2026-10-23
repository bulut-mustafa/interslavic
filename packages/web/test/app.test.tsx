// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

describe('translator UI', () => {
  it('renders the translation', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('žena').length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });

  it('carries each confidence level into the DOM', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll('.feature').length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    const levels = [...container.querySelectorAll('.feature')].map((el) =>
      el.getAttribute('data-confidence'),
    );
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
    render(<App />);
    await waitFor(() => expect(screen.getByText('nominative')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText('accusative')).toBeTruthy();
  });

  it('offers the alternative when the engine guessed', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/could also be perfective/)).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('marks an unverified word in the output and lists it', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll('.is-flagged').length).toBe(1), {
      timeout: 3000,
    });
    expect(screen.getByText(/may not be a real form/)).toBeTruthy();
    expect(screen.getAllByText('unverified').length).toBe(1);
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
    expect(container.querySelector('.output')?.textContent).toBe('žena čitala knigu.');
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
    await waitFor(() => expect(container.querySelectorAll('.citation').length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    const tiers = [...container.querySelectorAll('.citation > summary')].map((el) =>
      el.getAttribute('data-tier'),
    );
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
