#!/usr/bin/env bash
# Mutation audit: deliberately introduce a bug, then confirm the test suite
# catches it. A SURVIVING mutation means the tests do not actually verify that
# behaviour - i.e. fake coverage.
#
# Usage: bash scripts/mutation-audit.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# A FIXED directory, not mktemp: the EXIT trap below cannot run on SIGKILL -
# which is what an out-of-memory watchdog sends - and three such kills left a
# mutated file in the working tree. Keeping the backups at a known path makes
# that recoverable: the next run restores them before doing anything else.
BACKUP=${MUTATION_BACKUP:-.mutation-backup}
mkdir -p "$BACKUP"

restore_all() {
  local f b n=0
  for f in "$BACKUP"/*.bak; do
    [ -e "$f" ] || continue
    b=$(basename "$f" .bak)
    [ -e "$BACKUP/$b.path" ] || continue
    cp "$f" "$(cat "$BACKUP/$b.path")" && n=$((n + 1))
  done
  printf '%s' "$n"
}

# Recover from a previous run that was killed before it could restore.
recovered=$(restore_all)
if [ "${recovered:-0}" -gt 0 ]; then
  printf 'recovered %s file(s) left mutated by an earlier interrupted run\n' "$recovered"
fi
rm -f "$BACKUP"/*.bak "$BACKUP"/*.path 2>/dev/null || true

trap 'restore_all >/dev/null; rm -f "$BACKUP"/*.bak "$BACKUP"/*.path 2>/dev/null || true' EXIT INT TERM HUP

save() { # save <file> <key>
  cp "$1" "$BACKUP/$2.bak"; printf '%s' "$1" > "$BACKUP/$2.path"
}
restore() { cp "$BACKUP/$1.bak" "$(cat "$BACKUP/$1.path")"; }

CASE=packages/engine/src/resolvers/case.ts
ASPECT=packages/engine/src/resolvers/aspect.ts
READER=packages/lexicon/src/reader.ts
REALIZE=packages/morph/src/realize.ts
ORTH=packages/morph/src/orthography.ts
PIPE=packages/engine/src/pipeline.ts
PREP=packages/engine/src/resolvers/preposition.ts
NUM=packages/rules/src/numerals.ts
PREPRULES=packages/rules/src/prepositions.ts
SPLIT=packages/lexicon/src/steen/split-lemmas.ts
FULLFORM=packages/lexicon/src/full-forms.ts
APP=packages/web/src/App.tsx
AUXRULES=packages/rules/src/auxiliaries.ts
FNWORDS=packages/rules/src/function-words.ts
MODALS=packages/rules/src/modals.ts
REFL=packages/rules/src/reflexives.ts
DERIV=packages/rules/src/derivation.ts
PRON=packages/rules/src/pronouns.ts
NEG=packages/rules/src/negation.ts
COMPARE=packages/morph/src/comparison.ts
MOTION=packages/rules/src/motion.ts
PARTIC=packages/morph/src/participles.ts
VERBPREP=packages/rules/src/verb-prepositions.ts
EXPL=packages/rules/src/expletives.ts
ANAPH=packages/rules/src/anaphora.ts
XPOS=packages/lexicon/src/steen/parse-xpos.ts
ADAPT=packages/engine/src/source/adapters.ts
LEXEME=packages/engine/src/stages/lexeme.ts
AUXST=packages/engine/src/stages/auxiliaries.ts
PREPST=packages/engine/src/stages/prepositions.ts
PHRASALST=packages/engine/src/stages/phrasal-verbs.ts
NEGST=packages/engine/src/stages/negation.ts
GOVST=packages/engine/src/stages/verb-government.ts
REALST=packages/engine/src/stages/realise.ts
AGRST=packages/engine/src/stages/agreement.ts
PREDST=packages/engine/src/stages/predicate-agreement.ts
COPST=packages/engine/src/stages/copula.ts
PARTST=packages/engine/src/stages/past-participle.ts
NUMST=packages/engine/src/stages/numeral-government.ts
RENDST=packages/engine/src/stages/render.ts
TREEST=packages/engine/src/tree.ts
GLOSSST=packages/engine/src/gloss.ts
FWJSON=packages/rules/data/function-words.json

save "$CASE" case; save "$ASPECT" aspect; save "$READER" reader
save "$REALIZE" realize; save "$ORTH" orth; save "$PIPE" pipe
save "$PREP" prep; save "$NUM" num; save "$PREPRULES" preprules; save "$SPLIT" split
save "$FULLFORM" fullform; save "$APP" app; save "$AUXRULES" auxrules; save "$FNWORDS" fnwords; save "$MODALS" modals; save "$REFL" refl; save "$DERIV" deriv; save "$PRON" pron; save "$NEG" neg; save "$COMPARE" compare; save "$MOTION" motion; save "$PARTIC" partic; save "$VERBPREP" verbprep; save "$EXPL" expl; save "$ANAPH" anaph; save "$XPOS" xpos; save "$ADAPT" adapt; save "$FWJSON" fwjson
save "$LEXEME" lexeme; save "$AUXST" auxst; save "$PREPST" prepst
save "$PHRASALST" phrasalst; save "$NEGST" negst; save "$GOVST" govst
save "$REALST" realst; save "$AGRST" agrst; save "$PREDST" predst
save "$COPST" copst; save "$PARTST" partst; save "$NUMST" numst
save "$RENDST" rendst; save "$TREEST" treest; save "$GLOSSST" glossst

# The suite is run ~110 times, so a machine under memory pressure needs a
# smaller worker pool. Override, do not weaken: the same tests must run.
#   TEST_CMD="npx vitest run --silent --pool=forks --poolOptions.forks.maxForks=1"
TEST_CMD=${TEST_CMD:-"npx vitest run --silent"}

# The whole run is ~119 suite executions, which a machine short of memory may
# not survive in one process. FROM/TO run a slice by 1-based mutation index, so
# the audit can be completed in chunks without weakening it - each chunk still
# restores every file it touched:
#   FROM=1 TO=40 bash scripts/mutation-audit.sh
# CHECK=1 verifies every pattern still matches, without running any tests:
#   CHECK=1 bash scripts/mutation-audit.sh
FROM=${FROM:-1}
TO=${TO:-999}
INDEX=0

KILLED=0; SURVIVED=0; SURVIVORS=(); SKIPPED=0

mutate() { # mutate <name> <key> <sed-expr>
  local name="$1" key="$2" expr="$3"
  INDEX=$((INDEX+1))
  if [ "$INDEX" -lt "$FROM" ] || [ "$INDEX" -gt "$TO" ]; then
    SKIPPED=$((SKIPPED+1)); return
  fi
  local file; file=$(cat "$BACKUP/$key.path")

  # CHECK=1 verifies that every pattern still matches, without running the
  # suite. A `sed` pattern goes stale the moment the line it targets is
  # refactored, and a mutation that does not apply is counted as a SURVIVOR -
  # so the whole audit can be invalidated by an unrelated rename. This takes
  # seconds; discovering it one mutation at a time takes an hour.
  if [ -n "${CHECK:-}" ]; then
    sed -i '' "$expr" "$file" 2>/dev/null
    if diff -q "$BACKUP/$key.bak" "$file" >/dev/null 2>&1; then
      echo "  STALE     $name"
      SURVIVORS+=("$name [pattern not found]"); SURVIVED=$((SURVIVED+1))
    else
      KILLED=$((KILLED+1))
    fi
    restore "$key"
    return
  fi
  if ! sed -i '' "$expr" "$file" 2>/dev/null; then
    echo "  ?? $name - sed failed to apply"; restore "$key"; return
  fi
  if diff -q "$BACKUP/$key.bak" "$file" >/dev/null 2>&1; then
    echo "  ?? $name - MUTATION DID NOT APPLY (pattern not found)"
    SURVIVORS+=("$name [pattern not found]"); SURVIVED=$((SURVIVED+1))
    restore "$key"; return
  fi
  if $TEST_CMD >/dev/null 2>&1; then
    echo "  SURVIVED  $name"
    SURVIVORS+=("$name"); SURVIVED=$((SURVIVED+1))
  else
    echo "  killed    $name"
    KILLED=$((KILLED+1))
  fi
  restore "$key"
}

echo "=== case resolver ==="
mutate "nsubj -> Acc instead of Nom"        case   "s/decide<Case>('Nom', 'case.deprel.nsubj'/decide<Case>('Acc', 'case.deprel.nsubj'/"
mutate "iobj -> Acc instead of Dat"         case   "s/decide<Case>('Dat', 'case.deprel.iobj'/decide<Case>('Acc', 'case.deprel.iobj'/"
mutate "obj -> Gen instead of Acc"          case   "s/^        'Acc',\$/        'Gen',/"
mutate "obj claims 'certain' not 'default'" case   "s/'case.deprel.obj',\n        'default'/X/; s/'default',\$/'certain',/"
mutate "source-case copy disabled"          case   "s/if (!copyFromSource) return null;/if (true) return null;/"
mutate "fallback claims 'certain'"          case   "s/'case.fallback',\n    'guess'/X/; s/'guess',\$/'certain',/"

echo "=== plurale tantum ==="
mutate "plurale tantum given the source number" lexeme    "s/    } else if (entry.pos.numberOnly === 'Plur') {/    } else if (false) {/"
mutate "numeral imposes a number on a plurale tantum" numst     "s/    if (head.entry.pos.numberOnly === 'Plur') {/    if (false) {/"

echo "=== imperative, relative, complementizer ==="
mutate "imperative not detected"           auxst       "s/    if (token.feats\[.Mood.\] !== .Imp. || token.upos !== .VERB.) continue;/    if (true) continue;/"
mutate "imperative uses the singular"      auxst       "s/    imperatives.set(token.id, { person: .2., number });/    imperatives.set(token.id, { person: '2', number: 'Sing' });/"
mutate "let us treated as an optative"     auxst       "s/        if ((object.feats\['Person'\] ?? '3') === '1') {/        if (false) {/"
mutate "complementizer not recognised"     lexeme      "s/        ? lex.lookupLemma(COMPLEMENTIZER, 'CCONJ')\[0\]/        ? undefined/"
mutate "relative pronoun not recognised"   lexeme      "s/      ? lex.lookupLemma(RELATIVE_PRONOUN, 'PRON')\[0\]/      ? undefined/"
mutate "no-animate-head accusative skipped" agrst       "s/if (node.feats.get(.Case.)?.value !== .Acc.) continue;/if (true) continue;/"
mutate "no-animate-head picks the animate" agrst       "s/decide('Inan', 'animacy.noAnimateHead'/decide('Anim', 'animacy.noAnimateHead'/"
mutate "copula subject not walked up"      treest      "s/    subjectOfClause(verb, sentence);/    undefined;/"
mutate "direction marking discarded"       preprules "s/.test(gloss),/.test(gloss) \&\& false,/"
mutate "duration keeps its preposition"    prep   "s/if (lemma === .for. \&\& complement \&\& isTimeUnit(complement.lemma)) {/if (false) {/"
mutate "duration given the genitive"       prep   "s/decide<Case>(.Acc., .case.durationAccusative./decide<Case>('Gen', 'case.durationAccusative'/"
mutate "verb government not consulted"     prep   "s/    const governed = verbGovernedPhrase(governor.lemma, lemma);/    const governed = null;/"
mutate "temporal adverbial not accusative" case   "s/  byTemporalAdverbial,//"
mutate "temporal adverbial given genitive" case   "s/^    .Acc.,\$/    'Gen',/"
mutate "time units emptied"                verbprep "s/^  .second., .minute., .hour., .day., .night., .week., .fortnight.,$//"
mutate "believe-in entry removed"          verbprep "s/  .believe|in.: {/  'believe|never': {/"
mutate "predicate ignores a preposition"   predst      "s/    if (sentence.tokens.some((t) => t.head === node.token.id \&\& t.deprel === .case.)) continue;//"
mutate "published form loses the tie"      realize "s/    const published = hits.filter((t) => preferred.includes(t.form));/    const published: typeof hits = [];/"
mutate "verb phrase head taken from the end" split "s/  if (reflexive || upos === .VERB.) {/  if (reflexive) {/"
mutate "leading ne treated as the head"    split  "s/  if (words.length > 1 \&\& words\[0\] === .ne.) {/  if (false) {/"
mutate "library error marker accepted"     realize "s/  if (\/ERROR\/.test(form)) {/  if (false) {/"
mutate "error forms indexed as valid"      fullform "s/    if (k.includes(.error.)) return;//"
mutate "transitivity not ranked on"        reader "s/    if (ctx.hasDirectObject === true \&\& e.pos.intransitive \&\& !governsACase) s += 200;//"
mutate "object-less verb may be transitive" reader "s/    if (ctx.hasDirectObject === false \&\& e.pos.transitive) s += 200;//"
mutate "government code does not exempt"   reader "s/    const governsACase = e.addition.governs !== undefined;/    const governsACase = false;/"
mutate "intr marker conflated with unmarked" xpos "s/      intransitive: has(.intr..),/      intransitive: false,/"
mutate "phrasal verbs not recognised"      phrasalst   "s/        if (child.deprel === .compound:prt.) candidates.push({ particle: child });//"
mutate "phrasal particle still emitted"    lexeme "s/    if (phrasalParticles.has(token.id)) {\$/    if (false) {/"
mutate "phrasal entry not preferred"       lexeme      "s/      phrasalVerbs.get(token.id) ??//"
mutate "split reports a false clitic"      split  "s/^      reflexive,\$/      reflexive: true,/"

echo "=== Russian source side ==="
mutate "russian glosses split on commas"   reader "s/          ruGlosses: parseGlosses(f\[cRu!\] ?? ..),/          ruGlosses: (f[cRu!] ?? '').split(',').map((x) => ({ text: x.trim(), index: 0 })).filter((g) => g.text),/"
mutate "T-V distinction ignored"           pron   "s/      return marksSecondPersonNumber \&\& !plural ? .ty. : .vy.;/      return 'vy';/"
mutate "adapter says russian is like english" adapt "s/  marksSecondPersonNumber: true,/  marksSecondPersonNumber: false,/"
mutate "deprel subtype not matched"        numst       "s/    if (baseDeprel(node.token.deprel) !== .nummod.) continue;/    if (node.token.deprel !== 'nummod') continue;/"
mutate "infinitive always needs a marker"  lexeme      "s/      const infinitiveNeedsMarker = !adapter.copyAspect;/      const infinitiveNeedsMarker = true;/"
mutate "imperative gated to english"       auxst       "s/    if (token.feats\[.Mood.\] !== .Imp. || token.upos !== .VERB.) continue;/    if (token.feats['Mood'] !== 'Imp' || token.upos !== 'VERB' || sentence.lang !== 'en') continue;/"
mutate "imperative number always plural"   auxst  "s/    const number = adapter.marksSecondPersonNumber\$/    const number = false/"
mutate "complementizer list emptied"       adapt  "s/  complementizers: \[.что.\],/  complementizers: [],/"
mutate "relative pronoun gated to english" lexeme "s/      token.feats\[.PronType.\] === .Rel.\$/      sentence.lang === 'en' \&\& token.feats['PronType'] === 'Rel'/"
mutate "copula never inserted"             adapt  "s/  omitsPresentCopula: true,/  omitsPresentCopula: false,/"
mutate "russian future not recognised"     adapt  "s/  futureAuxiliaryLemma: .быть.,/  futureAuxiliaryLemma: null,/"
mutate "future aux accepts a participle"   auxst       "s/      if (head?.feats\[.VerbForm.\] !== .Inf.) continue;//"
mutate "analytic superlative ignored"      adapt  "s/  analyticSuperlative: .самый.,/  analyticSuperlative: null,/"
mutate "superlative marker not raised"     lexeme      "s/    const sourceDegree = analyticSuperlatives.has(token.id) ? .Sup. : token.feats\[.Degree.\];/    const sourceDegree = token.feats['Degree'];/"
mutate "indeclinable loses its degree"     realst "s/        degree === .Cmp. || degree === .Sup.\$/        false/"
mutate "already-comparative compared again" lexeme     "s/      degreeIsOnAnotherStem \&\&//"
mutate "comparison standard gets no od"    auxst       "s/      if (head?.feats\[.Degree.\] !== .Cmp.) continue;/      continue;/"
mutate "od added over a preposition"       auxst       "s/      if (sentence.tokens.some((t) => t.head === token.id \&\& t.deprel === .case.)) continue;/      if (false) continue;/"
mutate "od keyed to the phrase head"       realst      "s/    const plan_ = plan.find((n) => phraseOf(id, sentence).has(n.token.id));/    const plan_ = plan.find((n) => n.token.id === id);/"
mutate "conditional particle ignored"      auxst       "s/    if (token.feats\[.Mood.\] !== .Cnd.) continue;/    continue;/"
mutate "subjectless adjective not neuter"  predst      "s/        node.token.upos === .ADJ. ||//"
mutate "curated words gated to english"    lexeme      "s/^      sentence.lang,$/      'en',/"
mutate "russian curated words removed"     fwjson "s/\"lang\": \"ru\"/\"lang\": \"xx\"/"
mutate "fused clitic never stripped"       pipe   "s/      if (!token.lemma.toLowerCase().endsWith(suffix)) continue;/      continue;/"
mutate "stripping preferred over headword" pipe   "s/    if (lex.lookup(token.lemma, sentence.lang).some((e) => e.pos.upos === .VERB.)) {/    if (false) {/"
mutate "clitic keyed on Voice not the form" pipe  "s/    if (adapter.reflexiveVerbSuffixes.some((x) => form.endsWith(x))) {/    if (token.feats['Voice'] === 'Mid' || token.feats['Voice'] === 'Pass') {/"
mutate "clitic doubled on a reflexive lemma" realst    "s/      !splitMultiword(entry.lemma, .VERB.).reflexive \&\&//"
mutate "reflexive lemma penalised as multiword" reader "s/      !splitMultiword(e.lemma, e.pos.upos).reflexive\$/      true/"
mutate "noun ignores the counting numeral" lexeme      "s/        adapter.copyCase \&\& countingNumeral ? countingNumeral.feats\[.Case.\] : undefined;/        undefined;/"
mutate "passive counts as intransitive"    pipe   "s/      ...(token.upos === .VERB. \&\& !isPassiveClause(token, sentence)/      ...(token.upos === 'VERB'/"
mutate "passive voice not detected"        pipe   "s/  if (verb.feats\[.Voice.\] === .Pass.) return true;//"
mutate "verbless clause gets no copula"    copst       "s/      if (node.token.deprel !== .root.) continue;/      continue;/"
mutate "copula placed at the phrase head"  copst       "s/      const after = plan.find((n) => !opening.has(n.token.id)) ?? node;/      const after = node;/"
mutate "copula opening ignores the subject" copst      "s/        subject \&\& subject.token.id < node.token.id ? subject.token.id : node.token.id,/        node.token.id,/"
mutate "phrase swallows a nested subject"  treest      "s/      if (t.head === rootId \&\& t.deprel.startsWith(.nsubj.)) continue;/      if (t.deprel.startsWith('nsubj')) continue;/"

mutate "expletive subject kept"            lexeme      "s/    if (isExpletiveSubject(token, sentence)) {/    if (false) {/"
mutate "UD expl label ignored"             expl   "s/  if (token.deprel === .expl.) return true;//"
mutate "weather verbs emptied"             expl   "s/  .rain., .snow., .hail., .sleet., .drizzle., .thunder., .pour.,//"
mutate "any nsubj it treated as dummy"     expl   "s/  return verb?.upos === .VERB. \&\& WEATHER_VERBS.has(verb.lemma.toLowerCase());/  return true;/"
mutate "impersonal predicate not neuter"   predst      "s/      node.feats.set(.Gender., decide(.Neut., .agreement.impersonal./      node.feats.set('Gender', decide('Fem', 'agreement.impersonal'/"
mutate "clausal subject gets conjugated"   lexeme      "s/          token.deprel === .csubj.) \&\&/          false) \&\&/"
mutate "question inversion kept"           realst      "s/  if (punctuation.includes(.?.) \&\& !sentence.tokens.some((t) => t.feats\[.PronType.\] === .Int.)) {/  if (false) {/"
mutate "wh-questions also reordered"       realst      "s/ \&\& !sentence.tokens.some((t) => t.feats\[.PronType.\] === .Int.)//"
mutate "verb-first question not reordered" realst      "s/    if (verbIndex >= 0) {/    if (verbIndex > 0) {/"
mutate "person predicate not animate"      predst      "s/      node.feats.set(.Animacy., decide(.Anim., .agreement.predicate.person./      node.feats.set('Animacy', decide('Inan', 'agreement.predicate.person'/"
mutate "predicate noun agrees in gender"   predst      "s/    if (node.token.upos !== .NOUN.) {/    if (true) {/"
mutate "3rd person treated as a person"    predst      "s/      (subjectFeats\[.Person.\] === .1. || subjectFeats\[.Person.\] === .2.) \&\&/      true \&\&/"
mutate "recipient verb class ignored"      prep   "s/  if (!RECIPIENT_VERBS.has(host.lemma.toLowerCase())) return false;//"
mutate "recipient not sought past the object" prep "s/  for (let hops = 0; host \&\& host.upos !== .VERB. \&\& hops < 3; hops++) {/  for (let hops = 0; false; hops++) {/"
mutate "placeholder one kept"              realst "s/    if (isOneAnaphor(token, sentence)) {\$/    if (false) {/"
mutate "placeholder needs no modifier"     anaph "s/      (t.deprel === .amod. || (t.deprel === .det. \&\& t.feats\[.PronType.\] !== .Art.)),/      true,/"
mutate "article counts as a modifier"      anaph "s/t.feats\[.PronType.\] !== .Art./true/"
mutate "antecedent not consulted"          anaph "s/  return before.length > 0 ? before\[before.length - 1\]! : null;/  return null;/"
mutate "antecedent taken from the wrong end" anaph "s/before\[before.length - 1\]!/before[0]!/"
mutate "possessive clitic not a marker"    preprules "s/  \"'s\": .Gen.,//"
mutate "PART case markers ignored"         prepst      "s/ || token.upos === .PART.//"
mutate "nominal possessor agrees"          agrst       "s/      node.token.deprel === .nmod:poss. \&\&/      false \&\&/"
mutate "possessor not moved after the noun" realst     "s/    if (node.token.deprel !== .nmod:poss.) continue;/    if (true) continue;/"
mutate "pronominal possessive also moved"  realst      "s/    if (node.token.upos !== .NOUN. \&\& node.token.upos !== .PROPN.) continue;//"
mutate "directional sense leads by default" preprules "s/        Number(a.direction) - Number(b.direction) ||//"

echo "=== passive voice ==="
mutate "passive not detected"              lexeme      "s/      if (token.feats\['Voice'\] === 'Pass' \&\& token.feats\['VerbForm'\] === 'Part') {/      if (false) {/"
mutate "passive copula deleted"            pipe   "s/t.deprel === 'cop' || t.deprel === 'aux:pass'/t.deprel === 'cop'/"
mutate "present participle used for the passive" partic "s/t.xpos?.includes('pfpp')/t.xpos?.includes('prpp')/"
mutate "passive participle not substituted" realst     "s/      request\['Voice'\] === 'Pass' ? pastPassiveParticiple(entry.lemma, entry.pos.xpos) : null;/      null;/"
mutate "agent uses od strany"              prep   "s/    const agent = cands.find((c) => c.prep === 'od' \&\& c.case === 'Gen');/    const agent = undefined;/"
mutate "derived forms not indexed"         fullform "s/    for (const derived of derivedHeadwords(entry)) {/    for (const derived of []) {/"
mutate "negation emitted after the early returns" realst    "s/    if (negatedVerbs.has(token.id)) {/    if (false \&\& negatedVerbs.has(token.id)) {/"

echo "=== motion and the optative ==="
mutate "motion never prefers the accusative" prep  "s/? cands.find((c) => c.direction)/? undefined/"
mutate "every verb counts as motion"       prep   "s/ \&\& isMotionVerb(governingVerb.lemma)//"
mutate "optative not detected"             auxst       "s/        if (!subject || subject.id < token.id) continue;/        continue;/"
mutate "optative ignores the inversion"    auxst       "s/        if (!subject || subject.id < token.id) continue;/        if (!subject) continue;/"
mutate "optative particle dropped"         realst      "s/      surfaces.push('nehaj');/      surfaces.push('');/"
mutate "optative not third person"         lexeme      "s/        feats.set('Person', decide('3', 'optative.present', 'certain',/        feats.set('Person', decide('1', 'optative.present', 'certain',/"

echo "=== mood: conditional and final clauses ==="
mutate "would not treated as conditional"  auxrules "s/  would: 'conditional',//"
mutate "conditional particle ignores person" lexeme     "s/          ? conditionalAuxiliary(person, number)/          ? conditionalAuxiliary('3', 'Sing')/"
mutate "conditional adds the jesm auxiliary" partst     "s/    if (!conditionalVerbs.has(node.token.id) \&\& (personForAux === '1' || personForAux === '2')) {/    if (personForAux === '1' || personForAux === '2') {/"
mutate "purpose clause not detected"       auxst       "s/      if (!to) continue;/      continue;/"
mutate "final clause conjunction dropped"  realst      "s/        \['da', 'da', /        ['', 'da', /"
mutate "final clause comma removed"        realst      "s/      commaBeforeFinalClause();//"
mutate "purpose agrees with the wrong clause" auxst "s/      const subject = subjectOfClause(token, sentence);/      const subject = undefined;/"
mutate "going-to future not detected"      auxst       "s/      if (!beAux || !infinitive) continue;/      continue;/"
mutate "going-to fires without an infinitive" auxst     "s/      if (!beAux || !infinitive) continue;/      if (!beAux) continue;/"
mutate "predicate needs to be the root"    predst      "s/    if (!isRoot \&\& !hasSubject) continue;/    if (!isRoot) continue;/"
mutate "l-participle never walks up for a subject" partst    "s/      ownSubject ?? (walkedUp ? plan.find((n) => n.token.id === walkedUp.id) : undefined);/      ownSubject;/"

echo "=== comparison ==="
mutate "degree never read"                 lexeme      "s/      (sourceDegree === 'Cmp' || sourceDegree === 'Sup') \&\&/      false \&\&/"
mutate "comparative lemma not substituted" realst      "s/        ? compared(entry.lemma, entry.pos.xpos, degree as Degree)/        ? null/"
mutate "retry drops the derived lemma"     realst      "s/        lemma: derivedLemma ?? entry.lemma,/        lemma: entry.lemma,/"
mutate "superlative built on the positive" compare "s/  return fromComparative ?? superlatives\[0\] ?? null;/  return superlatives[superlatives.length - 1] ?? null;/"
mutate "predicate gender default removed"  predst      "s/    if (!node.feats.has('Gender')) {/    if (false) {/"
mutate "predicate skips untranslated subject" predst    "s/    const subjectName = subject.entry?.lemma ?? subject.token.form;/    if (!subject.entry) continue;\n    const subjectName = subject.entry.lemma;/"
echo "=== negative concord ==="
mutate "negative concord disabled"         lexeme      "s/    if (sentence.lang === 'en' \&\& rankedFirst \&\& inNegatedClause(token)) {/    if (false) {/"
mutate "negated clause not recorded"       negst       "s/      negatedClauses.add(head.id);//"
mutate "etymological suffixes dropped"     neg    "s/^const INDEFINITE_SUFFIXES = .*\$/const INDEFINITE_SUFFIXES = ['-nebud'];/"

echo "=== personal pronouns ==="
mutate "pronoun lemma normalisation off"   lexeme      "s/    const pronounLemma = isReflexive ? null : pronounLemmaFor(token.feats, sentence);/    const pronounLemma = null;/"
mutate "n- form used everywhere"           lexeme      "s/            prepCaseFor(governed !== undefined),/            prepCaseFor(true),/"
mutate "n- form never used"                lexeme      "s/            prepCaseFor(governed !== undefined),/            prepCaseFor(false),/"
mutate "you translated as ty"              pron   "s/      return marksSecondPersonNumber \&\& !plural ? .ty. : .vy.;/      return 'ty';/"
mutate "feminine pronoun read as masculine" pron  "s/      if (feats\['Gender'\] === 'Fem') return 'ona';//"
mutate "vy treated as singular"            pron   "s/ || lemma === 'vy'//"
mutate "verb number not taken from subject" lexeme     "s/      const number = subjectNumber(token, sentence, src\[.Number.\]);/      const number = src['Number'];/"

echo "=== word sense ==="
mutate "sense-label discount removed"      reader "s/^const UNSUPPORTED_SENSE_LABEL = 0.75;\$/const UNSUPPORTED_SENSE_LABEL = 1.0;/"
mutate "sense label always counts as supported" reader "s/      if (!supported) f \*= UNSUPPORTED_SENSE_LABEL;//"
mutate "sense label never counts as supported"  reader "s/      if (!supported) f \*= UNSUPPORTED_SENSE_LABEL;/      f *= UNSUPPORTED_SENSE_LABEL;/"
mutate "effective frequency ignored"       reader "s/  if (fa !== fb) return fb - fa;/  if (a.frequency !== b.frequency) return b.frequency - a.frequency;/"
mutate "female-equivalent demotion removed" reader "s/^const FEMALE_EQUIVALENT = 0.5;\$/const FEMALE_EQUIVALENT = 1.0;/"
mutate "female equivalence ignores the base" deriv "s/  return femaleEquivalentsOf(masculine).has(feminine);/  return feminine.endsWith('ka');/"
mutate "ka consonant change dropped"       deriv "s/  const changed = CONSONANT_CHANGE\[last\];/  const changed = undefined;/"

echo "=== reflexives ==="
mutate "reflexive detection disabled"      lexeme      "s/      token.upos === 'PRON' \&\&/      false \&\&/"
mutate "stressed sebe instead of clitic"   lexeme      "s/      if (isReflexive) {/      if (false) {/"
mutate "clitic asked for in every case"    refl   "s/  return grammaticalCase === 'Acc' || grammaticalCase === 'Dat';/  return true;/"
mutate "svoj rule disabled"                lexeme      "s/      sentence.lang === 'en' \&\& token.deprel === 'nmod:poss' \&\& possessorIsSubject(token);/      false;/"
mutate "svoj used for any possessive"      pipe   "s/if (token.feats\['Poss'\] !== 'Yes') return false;/if (token.feats['Poss'] === 'Yes') return true;/"
mutate "myself dropped from the list"      refl   "s/^  'myself',\$//"
mutate "no-op feature relaxation removed"  realize "s/    if (Object.keys(distinguished).length < Object.keys(want).length) {/    if (false) {/"

echo "=== modal verbs ==="
mutate "modal detection disabled"          auxst       "s/      if (modal) {/      if (false) {/"
mutate "modal complement conjugated"       lexeme      "s/      if (modalId !== undefined) {/      if (false) {/"
mutate "modal tense ignored"               lexeme      "s/        ? modalPlan.tense/        ? 'Pres'/"
mutate "must mapped to the frequent have"  modals "s/    isv: 'musěti',/    isv: 'iměti, imati',/"
mutate "modal lookup gloss ignored"        lexeme      "s/lex.lookup(modalPlan.gloss, sentence.lang)/lex.lookup(token.lemma, sentence.lang)/"

echo "=== coordination ==="
mutate "conjunct rule dropped from cascade" case   "s/^  byCoordination,\$//"
mutate "conjunct claims certain confidence"  case   "s/    inherited.confidence,/    'certain',/"
mutate "conjunct inherits the wrong token"   case   "s/byDeprel({ token: head, sentence })/byDeprel({ token, sentence })/"
mutate "government not propagated to conjuncts" prepst "s/for (const id of conjunctsOf(token.head, sentence)) {/for (const id of []) {/"

echo "=== verb government ==="
mutate "verb government pre-pass disabled"  govst       "s/if (!entry || !governs) continue;/if (true) continue;/"
mutate "government read off the wrong verb"  govst       "s/dep.deprel !== 'obj'/dep.deprel !== 'nsubj'/"
mutate "government loses its citation"      case   "s/verbGovernedBy$/verbGovernedByX/"

echo "=== aspect chain ==="
mutate "present tense -> Perf"              aspect "s/^        'Imp',\$/        'Perf',/"
mutate "aspect copy from source disabled"   aspect "s/if (sentence.lang !== 'ru') return null;/if (true) return null;/"
mutate "default aspect -> Perf"             aspect "s/      'Imp',\$/      'Perf',/"
mutate "imperfective cue list emptied"      aspect "s/^const IMPERFECTIVE_CUES = .*$/const IMPERFECTIVE_CUES: string[] = [];/"
mutate "perfective cue list emptied"        aspect "s/^const PERFECTIVE_CUES = .*$/const PERFECTIVE_CUES: string[] = [];/"

echo "=== lexicon ranking ==="
mutate "aspect ignored in ranking (THE TRAP)" reader "s/if (ctx.aspect \&\& e.pos.aspect \&\& e.pos.aspect !== ctx.aspect) s += 500;//"
mutate "frequency tie-break removed"        reader "s/  if (fa !== fb) return fb - fa;//"
mutate "frequency sorted ascending"         reader "s/  if (fa !== fb) return fb - fa;/  if (fa !== fb) return fa - fb;/"
mutate "POS match ignored in ranking"       reader "s/if (ctx.upos \&\& e.pos.upos !== ctx.upos) s += 1000;//"
mutate "russian stress-mark stripping off"  reader "/u0300-/d"
mutate "NFD normalisation removed"          reader "s/.normalize('NFD')//"
mutate "total-order tie-breaks removed"     reader "s/if (a.lemma.length !== b.lemma.length) return a.lemma.length - b.lemma.length;//"

echo "=== morphology wrapper ==="
mutate "principal parts ignored"            realize "s/const flat = (principalParts ?? \[\]).flat();/const flat: string[] = [];/"
mutate "variant preference emptied"        realize "s/^const VARIANT_PREFERENCE: (string | undefined)\[\] = .*$/const VARIANT_PREFERENCE: (string | undefined)[] = [];/"
mutate "variant preference order reversed"  realize "s/^const VARIANT_PREFERENCE: (string | undefined)\[\] = .*$/const VARIANT_PREFERENCE: (string | undefined)[] = ['Short', 'Athematic', 'Long', undefined];/"
mutate "unmarked no longer preferred first" realize "s/= \[undefined, 'Long', 'Athematic', 'Short'\]/= ['Long', 'Athematic', 'Short', undefined]/"
mutate "final tie-break sort removed"       realize "s/a.form.length !== b.form.length ? b.form.length - a.form.length : a.form.localeCompare(b.form)/0/"
mutate "picks last matching form not first" realize "s/const chosen = hits\[0\]!;/const chosen = hits[hits.length - 1]!;/"
mutate "multiword tail dropped"             realize "s/\[before, picked.chosen.form, after\]/[picked.chosen.form]/"
mutate "feature matching uses OR not AND"   realize "s/wanted.every((\[k, v\]) => t.feats?.\[k\] === v)/wanted.some(([k, v]) => t.feats?.[k] === v)/"
mutate "plurale tantum relaxation removed"  realize "s/if (hits.length === 0 \&\& 'Number' in want/if (false \&\& 'Number' in want/"

echo "=== orthography ==="
mutate "standard wrongly folds jat e-caron" orth   "s/const FOLD_TO_SIMPLIFIED: \[string, string\]\[\] = \[\['ě', 'e'\]\];/const FOLD_TO_SIMPLIFIED: [string, string][] = [];/;s/\['ę', 'e'\], \['ų', 'u'\]/['ě','e'], ['ę', 'e'], ['ų', 'u']/"
mutate "nasal u not folded"                 orth   "s/\['ų', 'u'\], //"
mutate "dj digraph folds to single char"    orth   "s/\['đ', 'dž'\]/['đ', 'd']/"
mutate "cyrillic skips the standard fold"    orth   "s/let out = toStandard(markSeparateJ(text));/let out = text;/"
mutate "cyrillic loses the two-sound rule"   orth   "s/let out = toStandard(markSeparateJ(text));/let out = toStandard(text);/"
mutate "two-sound prefix list emptied"       orth   "s/^const TWO_SOUND_PREFIXES = .*\$/const TWO_SOUND_PREFIXES: string[] = [];/"
mutate "soft consonant before j not marked"  orth   "s/(\\[ńĺľŃĹĽ\\])(j)/(ZZZZ)(j)/"

echo "=== pipeline ==="
mutate "agreement propagation disabled"     agrst       "s/      !AGREEING_DEPRELS.has(node.token.deprel) \&\&/      true ||/"
mutate "animacy dropped from agreement"     agrst       "s/for (const f of \['Case', 'Gender', 'Number', 'Animacy'\] as const)/for (const f of ['Case', 'Gender', 'Number'] as const)/"
mutate "articles no longer dropped"         lexeme      "s/if (adapter.dropsArticles \&\& isArticle(token)) {/if (false) {/"
mutate "lexical animacy never set"          lexeme      "s/if (entry.pos.gender === 'Masc') {/if (false) {/"
mutate "aspect resolved but not used"       pipe   "s/...(aspect ? { aspect: aspect.decision.value } : {}),//"

echo "=== prepositions ==="
mutate "government lookup disabled"         prep   "s/if (cands.length === 0) return { kind: 'unknown' };/if (true) return { kind: 'unknown' };/"
mutate "case-marker deletion disabled"      prep   "s/const marker = CASE_MARKER_PREPOSITIONS\[lemma\];/const marker = undefined as any;/"
mutate "recipient-to never detected"        prep   "s/^  return sentence.tokens.some(.*$/  return false;/"
mutate "of-genitive mapping removed"        preprules "s/  of: 'Gen',//"
mutate "to-dative mapping removed"          preprules "s/  to: 'Dat',//"
mutate "candidates sorted ascending by freq" preprules "s/b.freq - a.freq ||/a.freq - b.freq ||/"
mutate "confidence always certain"          prep   "s/    cands.length === 1 || towards ? 'high' : distinctCases.size === 1 ? 'high' : 'default';/    'certain';/"

echo "=== numerals ==="
mutate "numeral value lookup disabled"      num    "s/return table\[key\] ?? null;/return null;/"
mutate "5+ gives nominative not genitive"   num    "s/    case: 'Gen',/    case: 'Nom',/"
mutate "5+ gives singular not plural"       num    "s/^    number: 'Plur',\$/    number: 'Sing',/"
mutate "1 forces nominative (the old bug)"  num    "s/      case: null,\n      number: 'Sing',/X/; s/^      number: 'Sing',\$/      number: 'Plur',/"
mutate "2-4 boundary off by one"            num    "s/if (value >= 2 \&\& value <= 4)/if (value >= 2 \&\& value <= 5)/"
mutate "compound numerals claimed stated"   num    "s/stated: !(value > 20 \&\& \[1, 2, 3, 4\].includes(value % 10)),/stated: true,/"
mutate "digit parsing removed"              num    "/Number(digits)/d"
mutate "numeral government not applied"     numst       "s/    if (baseDeprel(node.token.deprel) !== .nummod.) continue;/    if (true) continue;/"
mutate "indeclinable fast-path removed"     realst "s/if (entry.pos.indeclinable) {/if (false) {/"
mutate "planned preposition ignored"        lexeme      "s/      (plannedPrep ? lex.lookupLemma(plannedPrep, .ADP.)\[0\] : undefined) ??/      undefined ??/"

echo "=== auxiliaries and predicates (M3) ==="
mutate "auxiliaries never classified"       auxst       "s/const role = auxiliaryRole(token.lemma);/const role = null;/"
mutate "aux tense not transferred to verb"  lexeme      "s/const src = { ...token.feats, ...(fromAux ?? {}) };/const src = { ...token.feats };/"
mutate "copula gets no verb features"       pipe   "s/const isCopula = (t: UdToken): boolean => t.deprel === 'cop' || t.deprel === 'aux:pass';/const isCopula = (_t: UdToken): boolean => false;/"
mutate "predicate agreement disabled"       predst      "s/    if (!isRoot \&\& !hasSubject) continue;/    continue;/"
mutate "predicate case not nominative"      predst "s/decide('Nom', 'case.predicate'/decide('Acc', 'case.predicate'/"
mutate "possessive deprel removed"          case   "s/  'nmod:poss',//"
mutate "aux plural number not transferred"  lexeme      "s/      if (number === 'Plur') {/      if (false) {/"

echo "=== multiword head (M3) ==="
mutate "multiword head back to first word"  split  "s/^    head: last,\$/    head: words[0] ?? '',/"
mutate "multiword prefix dropped"           split  "s/^    before: words.slice(0, -1).join(' '),\$/    before: '',/"
mutate "reflexive clitic not detected"      split  "s/  const reflexive = TRAILING_CLITICS.has(last);/  const reflexive = false;/"
mutate "single-word preference removed"     reader "/sourceIsSingleWord \&\&/d"
mutate "unintelligibility penalty removed" reader "s/if (e.unintelligibleIn >= 4) s += 1;//"

echo "=== past tense (M3) ==="
mutate "l-participle conversion disabled"   partst      "s/if (node.feats.get('Tense')?.value !== 'Past') continue;/if (true) continue;/"
mutate "past keeps finite form (imperfect)" partst      "s/node.feats.set('VerbForm', decide('Part', 'past.lParticiple', 'high', why));//"
mutate "past keeps person"                  partst      "s/node.feats.delete('Person'); \/\/ the l-participle has no person//"
mutate "past gender not from subject"       partst      "s/subject?.feats.get('Gender')?.value ??/undefined ??/"
mutate "past gender ignores pronoun feats"  partst      "s/subject?.token.feats\['Gender'\] ??/undefined ??/"

echo "=== full-form lexicon / self-validation ==="
mutate "validator always says yes"          fullform "s/has: (form) => index.has(key(form)),/has: () => true,/"
mutate "folded spellings not indexed"       fullform "s/if (folded !== t.form) add(folded, reading);//"
mutate "citation forms not indexed"         fullform "s/^    addEntryCitation(entry, add);\$/    void 0;/"
mutate "analyze returns nothing"            fullform "s/analyze: (form) => index.get(key(form)) ?? \[\],/analyze: () => [],/"
mutate "validation check skipped"           realst      "s/if (opts.validator) {\n      const missing/X/; s/const missing = unknownWords(surface, opts.validator);/const missing: string[] = [];/"
mutate "multiword validated as one string"  glossst "s|split(/[\\]s+/)|split(\"@@\")|"
mutate "validation rate always 1"           rendst      "s/: words.filter((w) => w.validation === 'validated').length \/ words.length/: 1/"

echo "=== auxiliaries: be / have / will ==="
mutate "progressive be not classified"      auxrules "s/  be: 'progressive',//"
mutate "perfect have not classified"        auxrules "s/  have: 'perfect',//"
mutate "will not classified"                auxrules "s/  will: 'future',//"
mutate "future ignores person/number"       auxrules "s/FUTURE_OF_BYTI\[\`\${person}-\${number}\`\]/FUTURE_OF_BYTI['3-Sing']/"
mutate "future dropped like other aux"      auxst       "s/if (role === 'future' || role === 'conditional') {/if (false) {/"
mutate "perfect not mapped to past"         lexeme      "s/const perfect = auxRoleForHead.get(token.id) === 'perfect';/const perfect = false;/"
mutate "future verb stays finite"           lexeme      "s/if (auxRoleForHead.get(token.id) === 'future') {/if (false) {/"

echo "=== gold-exposed grammar fixes ==="
mutate "negative concord removed"           negst       "s/negatedVerbs.add(target.id);//"
mutate "ne never emitted"                   realst      "s/if (negatedVerbs.has(token.id)) {/if (false) {/"
mutate "negation particle kept as a word"   negst       "s/if (isParticle) negationParticles.add(token.id);//"
mutate "negative words do not trigger ne"   negst  "s/const isNegativeWord = token.feats\\['PronType'\\] === 'Neg';/const isNegativeWord = false;/"
mutate "infinitive marker to not dropped"   lexeme "s/token.deprel === 'mark' \\&\\& token.lemma.toLowerCase() === 'to'/false/"
mutate "infinitive complement conjugated"   lexeme      "s/if (isInfinitiveComplement) {/if (false) {/"
mutate "aspect not reconciled with lexeme"  lexeme "s/aspect !== null \\&\\& lexemeAspect !== undefined \\&\\& lexemeAspect !== requestedAspect/false/"
mutate "curated lemma fallback removed"     lexeme      "s/ ?? lex.lookupLemma(curated.isv)\\[0\\]/ ?? undefined/"
mutate "curated negation condition ignored" fnwords     "s/    (negated ? candidates.find((w) => w.whenNegated) : undefined) ??/    undefined ??/"
mutate "curated sense condition ignored"   fnwords     "s/    candidates.find(hasDependent) ??/    undefined ??/"
mutate "curated sense lemmas ignored"      fnwords     "s/(want.lemmas?.includes(d.lemma.toLowerCase()) ?? true)/true/"
mutate "curated sense made unconditional"  fnwords     "s/!w.whenNegated \&\& !w.whenDependent/!w.whenNegated/"
mutate "curated function words ignored"     lexeme      "s/    const curatedEntry = curated/    const curatedEntry = false \&\& curated/"
mutate "perfect-as-perfective removed"      aspect "s/^  perfectAuxiliary,$//"
mutate "past-telic perfective removed"      aspect "s/^  pastWithObject,$//"
mutate "tense not read off the auxiliary"   aspect "s/if (token.feats\\['Tense'\\]) return token.feats\\['Tense'\\];/return token.feats['Tense'];/"
mutate "goal aspect rule removed"          aspect "s/^  pastWithGoal,$//"
mutate "goal prepositions ignored"         aspect "s/GOAL_PREPOSITIONS.includes(lemma) || //"
mutate "directional prepositions ignored"  aspect "s/ || candidatesForEnglish(lemma).some((p) => p.direction)//"
mutate "goal rule not limited to motion"   aspect "s/ || !isMotionVerb(token.lemma)//"
mutate "habitual cue below verb ignored"   aspect "/t.deprel === .det. \&\& children.some/d"

echo "=== web UI (M4) ==="
mutate "confidence never reaches the DOM"   app    "s/data-confidence={f.confidence}/data-confidence=\"certain\"/"
mutate "feature values shown raw (Nom)"     app    "s/if (name === 'Case') return CASES\[value\] ?? value;//"
mutate "alternatives hidden"                app    "s/{f.alternatives.length > 0 \&\&/{false \&\&/"
mutate "unverified words not flagged"       app    "s/w.validation !== 'validated' ? 'is-flagged' : ''/''/"
mutate "alternate script dropped"           app    "s/{alternate.length > 0 \&\& (/{false \&\& (/"
mutate "lexicon count hidden"               app    "s/{rate !== null \&\& (/{false \&\& (/"
mutate "parser instructions removed"        app    "s/npm run server<\/code> in another./X./"
mutate "word spaces removed"                app    "s/{j > 0 ? ' ' : null}//"
mutate "sentence punctuation dropped"       app    "s/{terminalPunctuation(s.text)}//"

echo
echo "==================================================="
echo "  mutations:  $INDEX total"
if [ "$SKIPPED" -gt 0 ]; then
  echo "  slice:      FROM=$FROM TO=$TO  ($SKIPPED skipped - this is a PARTIAL run)"
fi
if [ -n "${CHECK:-}" ]; then
  echo "  pattern check only - NO tests were run"
  echo "  patterns that apply: $KILLED"
  echo "  STALE:               $SURVIVED"
else
  echo "  killed:   $KILLED"
  echo "  SURVIVED: $SURVIVED"
fi
if [ "$SURVIVED" -gt 0 ]; then
  echo
  echo "  Surviving mutations (these behaviours are NOT covered):"
  for s in "${SURVIVORS[@]}"; do echo "    - $s"; done
fi
echo "==================================================="
