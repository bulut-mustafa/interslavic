/**
 * Grammatical features as a learner would say them aloud.
 *
 * The names and values are Universal Dependencies features
 * (https://universaldependencies.org/u/feat/index.html), which both the
 * translator's engine and the full-form index use. Every value the index can
 * emit has a label here (a test enumerates them); a value without one is shown
 * as it came, never replaced by a guess.
 */

const BY_NAME: Record<string, Record<string, string>> = {
  Case: {
    Nom: 'nominative',
    Acc: 'accusative',
    Gen: 'genitive',
    Dat: 'dative',
    Ins: 'instrumental',
    Loc: 'locative',
    Voc: 'vocative',
  },
  Number: { Sing: 'singular', Plur: 'plural', Ptan: 'plural only' },
  Gender: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' },
  Animacy: { Anim: 'animate', Inan: 'inanimate' },
  Tense: { Pres: 'present', Past: 'past', Fut: 'future' },
  Aspect: { Imp: 'imperfective', Perf: 'perfective' },
  Mood: { Ind: 'indicative', Imp: 'imperative' },
  VerbForm: { Fin: 'finite', Inf: 'infinitive', Part: 'participle' },
  Voice: { Act: 'active', Pass: 'passive' },
  Degree: { Pos: 'positive', Cmp: 'comparative', Sup: 'superlative' },
  Person: { '1': '1st person', '2': '2nd person', '3': '3rd person' },
  Variant: { Short: 'short form', Long: 'long form', Athematic: 'athematic' },
  NumType: {
    Card: 'cardinal',
    Ord: 'ordinal',
    Dist: 'distributive',
    Frac: 'fraction',
    Mult: 'multiplicative',
    Sets: 'collective',
  },
  PronType: {
    Prs: 'personal',
    Dem: 'demonstrative',
    Ind: 'indefinite',
    Int: 'interrogative',
    Neg: 'negative',
    Rcp: 'reciprocal',
    Rel: 'relative',
    Tot: 'total',
  },
  PrepCase: { Npr: 'not after a preposition', Pre: 'after a preposition' },
  Style: { Arch: 'archaic', Vrnc: 'vernacular' },
  'Number[psor]': { Sing: 'possessor singular', Plur: 'possessor plural' },
  'Gender[psor]': {
    Masc: 'possessor masculine',
    Fem: 'possessor feminine',
    'Masc,Neut': 'possessor masculine or neuter',
  },
};

/** Features whose mere presence says everything; their value is "Yes". */
const FLAGS: Record<string, string> = {
  Poss: 'possessive',
  Reflex: 'reflexive',
  Uninflect: 'does not inflect',
};

export function readable(name: string, value: string): string {
  if (FLAGS[name] && value === 'Yes') return FLAGS[name]!;
  return BY_NAME[name]?.[value] ?? value;
}

/** Display order: the features a learner looks for first. */
const ORDER = [
  'PronType', 'NumType', 'Degree', 'VerbForm', 'Mood', 'Tense', 'Aspect', 'Voice', 'Person',
  'Case', 'Gender', 'Animacy', 'Number', 'Variant', 'PrepCase', 'Style',
  'Poss', 'Reflex', 'Gender[psor]', 'Number[psor]', 'Uninflect',
];

/** "accusative, feminine, singular" - the features of one form, in reading order. */
export function describeFeatures(feats: Record<string, string>): string[] {
  const rank = (n: string): number => {
    const i = ORDER.indexOf(n);
    return i < 0 ? ORDER.length : i;
  };
  return Object.entries(feats)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, value]) => readable(name, value));
}
