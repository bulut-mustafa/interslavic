import { adapterFor } from '../source/adapters.ts';
import { decide, type Decision } from '../../../types/index.ts';
import { realize } from '../../../morph/src/realize.ts';
import { compared, type Degree } from '../../../morph/src/comparison.ts';
import { pastPassiveParticiple, presentActiveParticiple } from '../../../morph/src/participles.ts';
import { conditionalAuxiliary, futureAuxiliary } from '../../../rules/src/auxiliaries.ts';
import { isOneAnaphor, antecedentOf } from '../../../rules/src/anaphora.ts';
import { isExpletiveSubject } from '../../../rules/src/expletives.ts';
import { splitMultiword } from '../../../lexicon/src/steen/split-lemmas.ts';
import { REFLEXIVE_PRONOUN } from '../../../rules/src/reflexives.ts';
import { phraseOf, subjectOfClause } from '../tree.ts';
import type { GlossedWord } from '../result.ts';
import { glossFeature, matchedGloss, prepositionReason, unknownWords } from '../gloss.ts';
import type { RealiseInput, RealiseOutput } from './realise-input.ts';

/**
 * Ask the morphology for a form for every planned token, and emit the words
 * the source did not contain (an inserted copula, a comparison `od`, the past
 * auxiliary, a reflexive clitic).
 *
 * The last stage before rendering, and the one that must run after every
 * feature-setting stage - it reads the features they wrote.
 */
export function realiseStage(input: RealiseInput): RealiseOutput {
  const {
    sentence, lex, opts, orth, plan, dropped, punctuation,
    prepPlans, insertedPrepositions, pendingPrepositions, prepositionTargets,
    insertedCopulas, pastAuxiliaries, futureForms, imperatives, optativeVerbs,
    optativeMarkers, finitePurposeMarks, purposeClauses, needsReflexiveClitic,
    phrasalParticles, phrasalVerbs, negatedVerbs,
  } = input;
  void punctuation;

  /**
   * A yes/no question keeps declarative word order. The syntax page gives
   * exactly three ways to form one, and inverting the verb and subject is not
   * among them:
   *
   *   "either it differs from a normal declarative sentence only by
   *    intonation: - Otec kupil knigu? 'Has father bought a book?'
   *    or this sentence is preceded by the particle či: - Či otec kupil knigu?
   *    or it is marked by the question particle li placed right after the focus
   *    point of the question, usually the verb: - Kupil li otec knigu?"
   *   http://steen.free.fr/interslavic/syntax.html
   *
   * All three put the subject before the verb. English inversion was being
   * copied straight through, so "Can you help me?" came out as "Možete vy
   * pomagati mně?". Reordering the PLAN rather than the surfaces keeps each
   * node's own extra words - `ne`, the past auxiliary - attached to it.
   *
   * Wh-questions are left alone: the page fronts the interrogative and the
   * rest follows, which is already the source order.
   */
  if (punctuation.includes('?') && !sentence.tokens.some((t) => t.feats['PronType'] === 'Int')) {
    const verbIndex = plan.findIndex((n) => n.feats.get('VerbForm')?.value === 'Fin');
    // Not `> 0`: a yes/no question is exactly the case where the finite verb
    // comes FIRST, which is the inversion being undone.
    if (verbIndex >= 0) {
      const subject = subjectOfClause(plan[verbIndex]!.token, sentence);
      const subjectIndex = subject ? plan.findIndex((n) => n.token.id === subject.id) : -1;
      if (subjectIndex > verbIndex) {
        const [subjectNode] = plan.splice(subjectIndex, 1);
        plan.splice(verbIndex, 0, subjectNode!);
      }
    }
  }

  /**
   * A genitive possessor FOLLOWS the noun it possesses, which is how the
   * corpus writes it throughout:
   *
   *   "Bog råzměšal język cěloj zemje"     (the language of the whole earth)
   *   http://steen.free.fr/interslavic/babel_text.html
   *   "zvězda v centru Solnečnoj sistemy"  (the centre of the Solar System)
   *   "Rodny jezyk němcov i němečskyh menšistv světa"
   *   https://incubator.wikimedia.org/wiki/Wp/isv
   *
   * English puts it first, so "my brother's book" came out as "mojego brata
   * kniga". Only a NOMINAL possessor moves: a pronominal possessive is a
   * determiner and precedes, as "svoju rozu" and "moja mati" do.
   */
  for (let i = 0; i < plan.length; i++) {
    const node = plan[i]!;
    if (node.token.deprel !== 'nmod:poss') continue;
    if (node.token.upos !== 'NOUN' && node.token.upos !== 'PROPN') continue;

    // The possessor takes its own modifiers with it, in their existing order.
    const subtree = new Set<number>([node.token.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of plan) {
        if (!subtree.has(n.token.id) && subtree.has(n.token.head)) {
          subtree.add(n.token.id);
          grew = true;
        }
      }
    }
    const headIndex = plan.findIndex((n) => n.token.id === node.token.head);
    if (headIndex < 0 || headIndex < i) continue;

    const moving = plan.filter((n) => subtree.has(n.token.id));
    const rest = plan.filter((n) => !subtree.has(n.token.id));
    const at = rest.findIndex((n) => n.token.id === node.token.head);
    plan.length = 0;
    plan.push(...rest.slice(0, at + 1), ...moving, ...rest.slice(at + 1));
    i = -1; // the indices moved; restart
  }

  /**
   * An inserted preposition governs a whole phrase, so it goes before the
   * phrase's first SURVIVING word rather than before its head - keyed to the
   * head it landed after the determiner, "veče togo od doma".
   */
  for (const id of prepositionTargets) {
    const plan_ = plan.find((n) => phraseOf(id, sentence).has(n.token.id));
    const spec = pendingPrepositions.get(id);
    if (plan_ && spec) insertedPrepositions.set(plan_.token.id, spec);
  }

  const words: GlossedWord[] = [];
  const surfaces: string[] = [];

  /**
   * A mark attaches to the preceding word, so it renders without a space.
   * Never doubled: a final clause the source already set off keeps one.
   */
  const appendPunctuation = (mark: string): void => {
    const last = surfaces.length - 1;
    if (last < 0 || /[,;:!?]$/.test(surfaces[last]!)) return;
    surfaces[last] += mark;
    const lastWord = words[words.length - 1];
    if (lastWord) lastWord.surface += mark;
  };
  const appendComma = (): void => appendPunctuation(',');

  /**
   * A final clause is set off by a comma. No page states the rule outright,
   * but all four of the syntax page's own examples write one:
   *   "Turisti posětet Niderlandiju, že by fotografovali tulipany."
   *   "Ona prinosi jabloka, da by děti byli zdrave."
   */
  const commaBeforeFinalClause = appendComma;

  /**
   * The source's own commas, carried over like its final punctuation rather
   * than dropped: "Iduči do raboty, ona vsegda dymi cigaretoju", "Jedni ljudi
   * prědpočitajut lěto, drugi zimu" (verbs and numerals pages, where the
   * English has its comma in the same place). Each is owed by the word before
   * it and paid once that word's node has been emitted - after any `ne`,
   * auxiliary or clitic the node carries.
   *
   * The other clause-separating marks travel the same way: the semicolons of
   * a text like the Lord's Prayer ("da svjatitsja imja Tvoje; da priidet...")
   * were dropped and its clauses ran together. Only INTERIOR marks - the
   * final one is the sentence's own and is added with the text.
   */
  const INTERIOR_MARKS = new Set([',', ';', ':', '!', '?']);
  const punctuationAfter = new Map<number, string>();
  // Owed by the last word that is actually WRITTEN: a word absorbed into a
  // phrase ("me" in "Excuse me," -> "Izvinite,") would take the comma with it.
  const written = new Set(plan.map((n) => n.token.id));
  for (const t of sentence.tokens) {
    if (t.upos !== 'PUNCT' || !INTERIOR_MARKS.has(t.form)) continue;
    if (!sentence.tokens.some((p) => p.id > t.id && p.upos !== 'PUNCT')) continue;
    const before = sentence.tokens.filter((p) => p.id < t.id && p.upos !== 'PUNCT' && written.has(p.id)).at(-1);
    if (before) punctuationAfter.set(before.id, t.form);
  }
  let owed: string | undefined;

  for (const node of plan) {
    const { token, entry, feats, notes } = node;
    if (owed) appendPunctuation(owed);
    owed = punctuationAfter.get(token.id);
    // "čim močněje on dul, tym bolje ..." - the second half is set off.
    if (feats.get('Case')?.ruleId === 'comparison.correlative' && entry?.lemma === 'tȯj') appendComma();

    /**
     * Words the source left out are emitted FIRST, before any branch that can
     * `continue`. They precede the word they attach to, and the indeclinable
     * branch below returns early - so an inserted word whose target happened
     * to be a preposition or an adverb was silently dropped. That is how the
     * second `od` in "starějši od mene na dva roky" disappeared, which in turn
     * masked a mutation and made its guard look inert.
     */
    const preposition = insertedPrepositions.get(token.id);
    if (preposition) {
      surfaces.push(preposition.form);
      words.push({
        surface: preposition.form,
        lemma: preposition.form,
        sourceForm: '(preposition)',
        pos: 'prep.',
        features: [],
        lexicalChoice: { chosen: preposition.form, because: preposition.because, rejected: [] },
        notes: [],
        validation: opts.validator
          ? unknownWords(preposition.form, opts.validator).length === 0
            ? 'validated'
            : 'unvalidated'
          : 'validated',
      });
    }

    const copula = insertedCopulas.get(token.id);
    if (copula) {
      surfaces.push(copula.form);
      words.push({
        surface: copula.form,
        lemma: 'byti',
        sourceForm: '(copula)',
        pos: 'v.intr. ipf.',
        features: [
          glossFeature(
            'Person',
            decide(
              copula.person,
              'copula.inserted',
              'certain',
              'the source omits the present-tense copula and Interslavic writes it ' +
                '("Petr jest ščestliv", "dom jest velik")',
            ),
          ),
          glossFeature(
            'Number',
            decide(copula.number, 'copula.inserted', 'certain', 'agrees with the subject'),
          ),
        ],
        notes: [],
        /**
         * Checked like any other emitted word. `jest`/`jesmo` are real forms of
         * `byti`, and marking an inserted word "unvalidated" made the
         * validation rate report a problem that does not exist - the whole
         * point of that number is that an unvalidated word means a form we
         * cannot vouch for.
         */
        validation: opts.validator
          ? unknownWords(copula.form, opts.validator).length === 0
            ? 'validated'
            : 'unvalidated'
          : 'validated',
      });
    }


    /**
     * A placeholder "one" leaves only its modifier behind - see
     * packages/rules/src/anaphora.ts. It is suppressed HERE rather than when
     * entries are chosen, because the modifier takes its case, gender and
     * number from it: dropping it earlier left "I want the red one" with no
     * agreement at all, as "Ja hoču črvena".
     */
    if (isOneAnaphor(token, sentence)) {
      dropped.push({
        form: token.form,
        why: 'Interslavic has no placeholder noun - the modifier stands on its own',
      });
      continue;
    }
    // `ne` goes immediately before the verb it negates, which is why the
    // English particle was deleted rather than translated in place.
    //
    // Emitted FIRST, before any branch below can return early. Those
    // branches silently dropped the negation: a negated future came out as
    // "Ja nikogda budu čitati" - the opposite of what was asked - and so did
    // a negated verb that is not in the dictionary.
    if (negatedVerbs.has(token.id)) {
      surfaces.push('ne');
      words.push({
        surface: 'ne',
        lemma: 'ne',
        sourceForm: '(negation)',
        pos: 'adv.',
        features: [
          glossFeature(
            'Polarity',
            decide(
              'Neg',
              'negation.beforeVerb',
              'certain',
              'Interslavic puts `ne` directly before the verb, and requires it even ' +
                'alongside a negative word such as nikogda or nikto (negative concord)',
            ),
          ),
        ],
        notes: [],
        validation: 'validated',
      });
    }

    const purposeAt = purposeClauses.get(token.id);
    if (purposeAt) {
      commaBeforeFinalClause();
      const particle = conditionalAuxiliary(purposeAt.person, purposeAt.number);
      for (const [form, lemma, why] of [
        ['že', 'že', 'a final clause is introduced by "že" or "da"'],
        [particle, 'by', 'followed by the conditional, which agrees with the subject'],
      ] as const) {
        surfaces.push(form);
        words.push({
          surface: form,
          lemma,
          sourceForm: '(purpose clause)',
          pos: 'conj.',
          features: [glossFeature('Mood', decide('Cnd', 'purpose.conditional', 'certain', why))],
          notes: [],
          validation: 'validated',
        });
      }
    }

    if (optativeMarkers.has(token.id)) {
      surfaces.push('nehaj');
      words.push({
        surface: 'nehaj',
        lemma: 'nehaj',
        sourceForm: token.form,
        pos: 'particle',
        features: [
          glossFeature('Mood', decide('Opt', 'optative.nehaj', 'certain',
            'the optative particle "nehaj" with the present tense (Nehaj žive dolgo!)')),
        ],
        notes: [],
        validation: 'validated',
      });
      continue;
    }

    const finiteMark = finitePurposeMarks.get(token.id);
    if (finiteMark) {
      commaBeforeFinalClause();
      const particle = conditionalAuxiliary(finiteMark.person, finiteMark.number);
      for (const [form, lemma, why] of [
        ['da', 'da', 'a final clause is introduced by "že" or "da"'],
        [particle, 'by', 'followed by the conditional, which agrees with the subject'],
      ] as const) {
        surfaces.push(form);
        words.push({
          surface: form,
          lemma,
          sourceForm: token.form,
          pos: 'conj.',
          features: [glossFeature('Mood', decide('Cnd', 'purpose.conditional', 'certain', why))],
          notes: [],
          validation: 'validated',
        });
      }
      continue;
    }

    const features = [...feats.entries()].map(([k, d]) => glossFeature(k, d));

    // The rewritten future auxiliary: "will" -> bųdų / bųdeš / bųde ...
    const future = futureForms.get(token.id);
    if (future) {
      surfaces.push(future.form);
      words.push({
        surface: future.form,
        lemma: 'byti',
        sourceForm: token.form,
        pos: 'v.intr. ipf.',
        features: [
          glossFeature(
            'Tense',
            decide('Fut', 'future.periphrastic', 'certain', 'the future is byti + infinitive'),
          ),
          glossFeature(
            'Person',
            decide(future.person, 'future.agreement', 'certain', 'agrees with the subject'),
          ),
          glossFeature(
            'Number',
            decide(future.number, 'future.agreement', 'certain', 'agrees with the subject'),
          ),
        ],
        lexicalChoice: {
          chosen: future.form,
          because:
            'future of byti, stem bud- (the morphology library generates no future, so this ' +
            'one closed auxiliary paradigm is supplied from the grammar)',
          rejected: [],
        },
        notes,
        validation: 'validated',
      });
      continue;
    }

    if (!entry) {
      /**
       * A Russian name the dictionary does not have is written in Latin by
       * the pages' own letter tables (russianNameToLatin) - "Зульфия" ->
       * "Zuljfija" - and kept as it was where they do not cover a letter.
       */
      const toLatin = adapterFor(sentence).nameToLatin;
      const latinName = toLatin && token.upos === 'PROPN' ? toLatin(token.form) : null;
      if (latinName) notes.push(`a name, written in Latin by the Interslavic letter tables (${token.form})`);
      const surface = latinName ?? token.form;
      surfaces.push(surface);
      words.push({
        surface,
        lemma: token.lemma,
        sourceForm: token.form,
        pos: token.upos,
        features,
        notes,
        validation: 'untranslated',
      });
      continue;
    }

    if (entry.pos.indeclinable) {
      /**
       * An indeclinable has no paradigm, but a COMPARATIVE is a different
       * lemma rather than an inflected form - `bystro` -> `bystrěje` - so the
       * degree still applies. Emitting the citation form regardless left
       * "быстрее" and "faster" as the positive `bystro`.
       */
      const degree = features.find((f) => f.name === 'Degree')?.value;
      const derived =
        degree === 'Cmp' || degree === 'Sup'
          ? compared(entry.lemma, entry.pos.xpos, degree as Degree)
          : null;
      if (!derived && (degree === 'Cmp' || degree === 'Sup')) {
        notes.push(`"${entry.lemma}" has no ${degree === 'Cmp' ? 'comparative' : 'superlative'} form`);
      }
      const form = derived ?? entry.lemma;
      const known = opts.validator ? unknownWords(form, opts.validator).length === 0 : true;
      surfaces.push(form);
      words.push({
        surface: form,
        lemma: entry.lemma,
        sourceForm: token.form,
        pos: entry.pos.raw,
        features,
        lexicalChoice: {
          chosen: form,
          because: prepositionReason(token, prepPlans) ??
            `matched ${sentence.lang} gloss "${matchedGloss(entry, token.lemma, sentence.lang)}"`,
          rejected: node.ranked.slice(1, 4).map((e) => `${e.lemma} (${e.pos.raw})`),
        },
        notes,
        validation: known ? 'validated' : 'unvalidated',
      });
      continue;
    }

    const pastAux = pastAuxiliaries.get(token.id);
    if (pastAux) {
      surfaces.push(pastAux.form);
      words.push({
        surface: pastAux.form,
        lemma: 'byti',
        sourceForm: '(past auxiliary)',
        pos: 'v.intr. ipf.',
        features: [
          glossFeature(
            'Person',
            decide(
              pastAux.person,
              'past.compoundAuxiliary',
              'certain',
              'the standard past is byti + l-participle; the auxiliary is only ' +
                'omitted in the third person',
            ),
          ),
          glossFeature(
            'Number',
            decide(pastAux.number, 'past.compoundAuxiliary', 'certain', 'agrees with the subject'),
          ),
        ],
        notes: [],
        validation: 'validated',
      });
    }

    // The transgressive is not inflected at all (verbs page), so it is the
    // derived form itself rather than a paradigm cell.
    const transgressive =
      feats.get('VerbForm')?.value === 'Conv'
        ? presentActiveParticiple(entry.lemma, entry.pos.xpos)
        : null;
    if (transgressive) {
      const known = opts.validator ? unknownWords(transgressive, opts.validator).length === 0 : true;
      surfaces.push(transgressive);
      words.push({
        surface: transgressive,
        lemma: entry.lemma,
        sourceForm: token.form,
        pos: entry.pos.raw,
        features,
        lexicalChoice: {
          chosen: transgressive,
          because: `matched ${sentence.lang} gloss "${matchedGloss(entry, token.lemma, sentence.lang)}"`,
          rejected: node.ranked.slice(1, 4).map((e) => `${e.lemma} (${e.pos.raw})`),
        },
        notes,
        validation: known ? 'validated' : 'unvalidated',
      });
      continue;
    }

    const request: Record<string, string> = {};
    for (const [k, d] of feats) request[k] = d.value;

    /**
     * A comparative is a LEMMA of its own ("veliky" > "vęčši"), which then
     * declines like any soft adjective. So the degree selects the lemma and is
     * removed from the feature request - the derived paradigm's own tokens are
     * tagged Degree=Pos, and asking them for Cmp would match nothing.
     */
    const degree = request['Degree'];
    const comparedLemma =
      degree === 'Cmp' || degree === 'Sup'
        ? compared(entry.lemma, entry.pos.xpos, degree as Degree)
        : null;

    // The passive participle is a lemma of its own and declines like an
    // adjective, so Voice selects the lemma and is removed from the request.
    const participleLemma =
      request['Voice'] === 'Pass' ? pastPassiveParticiple(entry.lemma, entry.pos.xpos) : null;
    if (participleLemma) delete request['Voice'];
    if (degree) delete request['Degree'];
    if ((degree === 'Cmp' || degree === 'Sup') && !comparedLemma) {
      notes.push(`"${entry.lemma}" has no ${degree === 'Cmp' ? 'comparative' : 'superlative'} form`);
    }

    const derivedLemma = participleLemma ?? comparedLemma;
    /**
     * A multi-word verb conjugates its first word, but the phrase's own entry
     * carries none of that verb's irregular stems: "iměti smysl" ("make
     * sense") came out "iměje smysl" where `iměti` alone gives "imaje". So the
     * stems are borrowed from the dictionary's entry for that first verb.
     */
    const ownParts = entry.addition.principalParts;
    const phraseVerbParts =
      !derivedLemma && entry.pos.upos === 'VERB' && /\s/.test(entry.lemma) && !ownParts?.flat().length
        ? lex.lookupLemma(entry.lemma.split(/\s+/)[0]!, 'VERB').find((e) => e.addition.principalParts?.flat().length)
            ?.addition.principalParts
        : undefined;
    const principalParts = derivedLemma ? undefined : (phraseVerbParts ?? ownParts);
    const result = realize({
      lemma: derivedLemma ?? entry.lemma,
      xpos: participleLemma ? 'adj.' : entry.pos.xpos,
      feats: request,
      principalParts,
    });

    let surface: string;
    let validation: GlossedWord['validation'] = 'unvalidated';
    if (result.ok) {
      surface = result.form;
      if (result.ambiguous.length > 0) {
        notes.push(`other forms share these features: ${result.ambiguous.join(', ')}`);
      }
    } else {
      // Retry without animacy/gender, which the library may not accept for
      // every class, before giving up on the citation form.
      const relaxed = { ...request };
      delete relaxed['Animacy'];
      // Same lemma as the first attempt: a comparative is its own lemma, and
      // retrying with the positive silently threw the comparison away -
      // "the biggest house" came back as "veliky dom".
      const second = realize({
        lemma: derivedLemma ?? entry.lemma,
        xpos: participleLemma ? 'adj.' : entry.pos.xpos,
        feats: relaxed,
        principalParts,
      });
      if (second.ok) {
        surface = second.form;
        notes.push('matched after relaxing animacy');
      } else {
        surface = derivedLemma ?? entry.lemma;
        notes.push(`could not inflect: ${result.reason} - citation form used`);
      }
    }

    // The real check: is this an attested form of a known Interslavic word?
    if (entry.unlisted) {
      // A name kept from the source with a case ending: not translated, and
      // not a word the full-form lexicon could know.
      validation = 'untranslated';
    } else if (opts.validator) {
      const missing = unknownWords(surface, opts.validator);
      validation = missing.length === 0 ? 'validated' : 'unvalidated';
      if (missing.length > 0) {
        notes.push(
          `NOT FOUND in the full-form lexicon: ${missing.join(', ')} - may not be a real form`,
        );
      }
    } else if (result.ok) {
      // No validator supplied: the most we can say is that a form was produced.
      validation = 'validated';
      notes.push('not checked against the full-form lexicon');
    }

    surfaces.push(surface);
    words.push({
      surface,
      lemma: entry.lemma,
      sourceForm: token.form,
      pos: entry.pos.raw,
      features,
      ...(node.aspect
        ? {
            aspect: {
              chosen: node.aspect.decision.value,
              because: node.aspect.decision.because,
              declined: node.aspect.declined,
            },
          }
        : {}),
      lexicalChoice: {
        chosen: entry.lemma,
        // Name the gloss that actually matched, and in which language column.
        // The en and ru columns are NOT symmetric - English "boy" matches
        // hlåpėc while Russian "мальчик" matches the diminutive hlåpčik,
        // because Russian's own reflex of that root (хлопец) means "lad".
        // Showing the matched gloss makes that visible instead of surprising.
        because:
          `matched ${sentence.lang} gloss ` +
          `"${matchedGloss(entry, token.lemma, sentence.lang)}"` +
          `; flavor rank ${entry.type}, frequency ${entry.frequency}`,
        rejected: node.ranked.slice(1, 4).map((e) => `${e.lemma} (${e.pos.raw}, freq ${e.frequency})`),
      },
      notes,
      validation,
    });

    /**
     * The reflexive clitic the source fused onto the verb, written separately:
     * "Pica dělaje se" - http://steen.free.fr/interslavic/syntax.html. Russian
     * "читается" and "строится" carry it inside the word, so without this the
     * middle and passive voices came out as plain actives.
     *
     * Skipped when the sentence already has a reflexive pronoun of its own, so
     * "Она моет себя" does not get a second one.
     */
    if (
      needsReflexiveClitic.has(token.id) &&
      // `bojati sę`, `učiti sę`, `podobati sę`: the chosen lemma already
      // carries the clitic and realisation keeps it, so adding one gave
      // "Ja boju se se psa".
      !splitMultiword(entry.lemma, 'VERB').reflexive &&
      !plan.some((n) => n.token.feats['Reflex'] === 'Yes' && n.token.upos === 'PRON')
    ) {
      const clitic = realize({
        lemma: REFLEXIVE_PRONOUN,
        xpos: 'pron.refl.',
        feats: { Case: 'Acc', Variant: 'Short' },
      });
      if (clitic.ok) {
        surfaces.push(clitic.form);
        words.push({
          surface: clitic.form,
          lemma: REFLEXIVE_PRONOUN,
          sourceForm: '(reflexive clitic)',
          pos: 'pron.refl.',
          features: [],
          lexicalChoice: {
            chosen: clitic.form,
            because:
              'the source fuses the reflexive onto the verb; Interslavic writes it ' +
              'separately ("Pica dělaje se")',
            rejected: [],
          },
          notes: [],
          validation: opts.validator
            ? unknownWords(clitic.form, opts.validator).length === 0
              ? 'validated'
              : 'unvalidated'
            : 'validated',
        });
      } else {
        notes.push('could not build the reflexive clitic');
      }
    }
  }
  if (owed) appendPunctuation(owed);

  return { words, surfaces };
}
