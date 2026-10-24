/**
 * The pipeline's stage order, declared rather than implied.
 *
 * `translate()` used to be one 2,996-line function whose ordering contract
 * lived in comments. Eight bugs in a single session came from that: numeral
 * government ran after agreement had already fixed the case; `ne` was inserted
 * inside the branch that had a dictionary entry, so an unknown verb lost the
 * negation with it; the copula landed inside the phrase it was meant to
 * precede. Each was an ordering mistake that no type and no test could see.
 *
 * Now each stage declares what it reads and what it writes, and the test beside
 * this file fails if the declared order lets a stage read something no earlier
 * stage has written. The names below are the fields the stages actually pass
 * between them, so the list is checkable rather than decorative.
 */
export interface StageSpec {
  /** The phase label the pipeline uses in its own comments. */
  phase: string;
  name: string;
  /**
   * Fields produced by earlier stages that this one reads. A `plan.*` name is
   * a feature group the stages write onto the plan nodes IN PLACE - the plan
   * object itself exists from phase A onward, so naming only `plan` would hide
   * every ordering dependency between the phases that mutate it, which is
   * where the agreement bugs actually lived.
   */
  reads: readonly string[];
  /** Fields this stage produces for later stages. */
  writes: readonly string[];
  /**
   * True for a step that is not a called stage function but a set of closures
   * the pipeline defines between two stages. They are declared because they
   * depend on earlier stages just as a stage does: `inNegatedClause` needs the
   * negation pass to have run, and `needsVerbFeatures` needs the modal plans.
   * Declaring them is what makes the order check cover the whole pipeline
   * rather than only the parts that happen to be function calls.
   */
  derived?: true;
}

/**
 * Facts that exist before any stage runs: the parse, the dictionary, the source
 * profile, and the pure helpers the pipeline derives from the sentence alone.
 */
export const PRELUDE: readonly string[] = [
  'sentence',
  'lex',
  'adapter',
  'orth',
  'dropped',
  'unknown',
  'contextWords',
  'punctuation',
  'personOf',
  'possessorIsSubject',
];

export const STAGES: readonly StageSpec[] = [
  {
    phase: '0-',
    name: 'planPhrasalVerbs',
    reads: ['sentence', 'lex', 'contextWords'],
    writes: ['phrasalVerbs', 'phrasalParticles'],
  },
  {
    phase: '0',
    name: 'planPrepositions',
    // A phrasal verb swallows its particle, so the phrasal pass must come first.
    reads: ['sentence', 'lex', 'phrasalVerbs', 'phrasalParticles'],
    writes: ['prepPlans', 'governedCase', 'deletedPreps'],
  },
  {
    phase: '0b',
    name: 'planAuxiliaries',
    reads: ['sentence', 'adapter', 'personOf'],
    writes: [
      'futureForms',
      'pastAuxiliaries',
      'insertedPrepositions',
      'pendingPrepositions',
      'insertedCopulas',
      'droppedAux',
      'auxFeatsForHead',
      'auxRoleForHead',
      'futureAuxToken',
      'conditionalVerbs',
      'purposeClauses',
      'finitePurposeMarks',
      'finitePurposeCarriers',
      'imperatives',
      'optativeMarkers',
      'optativeVerbs',
      'modalPlans',
      'modalOfHead',
      'prepositionTargets',
      'analyticSuperlatives',
    ],
  },
  {
    phase: '0c',
    name: 'planNegation',
    // `ne` precedes the MODAL where there is one ("ne mogu čitati"), so the
    // modal plans have to exist before the negation can be placed.
    reads: ['sentence', 'modalOfHead'],
    writes: ['negationParticles', 'negatedVerbs', 'negatedClauses'],
  },
  {
    phase: '0c+',
    name: 'derived closures',
    derived: true,
    reads: ['sentence', 'lex', 'contextWords', 'adapter', 'negatedClauses', 'modalPlans'],
    writes: ['inNegatedClause', 'needsVerbFeatures', 'rankedFor'],
  },
  {
    phase: '0d',
    name: 'planVerbGovernment',
    // Shares `rankedFor` with the lexeme stage on purpose: both must agree on
    // WHICH verb was chosen, or the case comes from a different lexeme than
    // the one that gets written.
    reads: ['sentence', 'rankedFor', 'needsVerbFeatures'],
    writes: ['verbGovernedCase'],
  },
  {
    phase: 'A',
    name: 'lexemeStage',
    reads: [
      'sentence',
      'adapter',
      'lex',
      'dropped',
      'unknown',
      'contextWords',
      'phrasalVerbs',
      'phrasalParticles',
      'prepPlans',
      'governedCase',
      'deletedPreps',
      'droppedAux',
      'auxFeatsForHead',
      'auxRoleForHead',
      'futureForms',
      'futureAuxToken',
      'conditionalVerbs',
      'purposeClauses',
      'finitePurposeMarks',
      'finitePurposeCarriers',
      'imperatives',
      'optativeVerbs',
      'modalPlans',
      'modalOfHead',
      'analyticSuperlatives',
      'negationParticles',
      'verbGovernedCase',
      'personOf',
      'possessorIsSubject',
      'inNegatedClause',
      'needsVerbFeatures',
      'rankedFor',
    ],
    writes: ['plan', 'byTokenId'],
  },
  {
    phase: 'B1',
    name: 'numeralGovernmentStage',
    // Before agreement, not after: "pet domov" needs the genitive plural, and
    // agreement propagation would otherwise have already given the noun the
    // numeral's own case.
    reads: ['plan', 'sentence'],
    writes: ['plan.numeralCase'],
  },
  {
    phase: 'B',
    name: 'agreementStage',
    reads: ['plan', 'byTokenId', 'sentence', 'plan.numeralCase'],
    writes: ['plan.agreedFeats'],
  },
  {
    phase: 'B2',
    name: 'predicateAgreementStage',
    // After propagation: a predicate adjective agrees with its SUBJECT, and
    // must not then be overwritten by a head it does not have.
    reads: ['plan', 'sentence', 'plan.agreedFeats'],
    writes: ['plan.predicateFeats'],
  },
  {
    phase: 'B3',
    name: 'copulaStage',
    // Needs the predicate's own features: the copula agrees with the subject
    // it links, and it is placed after the opening constituent.
    reads: ['plan', 'sentence', 'adapter', 'plan.predicateFeats'],
    writes: ['insertedCopulas'],
  },
  {
    phase: 'B4',
    name: 'pastParticipleStage',
    // The l-participle agrees with the subject in gender and number, so the
    // agreement passes must already have run.
    reads: ['plan', 'sentence', 'insertedCopulas', 'conditionalVerbs', 'plan.agreedFeats'],
    writes: ['pastAuxiliaries'],
  },
  {
    phase: 'C',
    name: 'realiseStage',
    // Every feature must be final here: realisation turns them into letters,
    // and nothing after this point can change a form.
    reads: [
      'plan',
      'sentence',
      'adapter',
      'orth',
      'prepPlans',
      'insertedPrepositions',
      'pendingPrepositions',
      'prepositionTargets',
      'insertedCopulas',
      'pastAuxiliaries',
      'futureForms',
      'imperatives',
      'optativeMarkers',
      'optativeVerbs',
      'purposeClauses',
      'finitePurposeMarks',
      'conditionalVerbs',
      'negatedVerbs',
      'plan.numeralCase',
      'plan.agreedFeats',
      'plan.predicateFeats',
    ],
    writes: ['words', 'surfaces'],
  },
  {
    phase: 'D',
    name: 'renderStage',
    reads: ['words', 'surfaces', 'punctuation', 'dropped', 'unknown', 'plan'],
    writes: [],
  },
];
