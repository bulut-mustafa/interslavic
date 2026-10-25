import { realize } from '../../../morph/src/realize.ts';
import { phraseOf, subjectPerson } from '../tree.ts';
import type { StageContext } from './context.ts';

/**
 * Insert the present-tense copula a source omits. See the adapter's
 * `omitsPresentCopula`; Russian writes no verb in "Он доктор" and Interslavic
 * does.
 */
export function copulaStage(ctx: StageContext): void {
  const { sentence, adapter, plan, insertedCopulas, pastAuxiliaries, conditionalVerbs } = ctx;

  if (adapter.omitsPresentCopula) {
    for (const node of plan) {
      if (node.token.deprel !== 'root') continue;
      /**
       * A short passive participle is predicative too - "Они наделены
       * разумом" - and Stanza tags it VERB. "The passive voice is created by
       * combining a form of the verb byti 'to be' with a passive participle"
       * (verbs page), so it takes the copula: "Oni sųt obdarjeni råzumom"
       * (van Steenbergen's UDHR Article 1).
       */
      const passiveParticiple =
        node.token.feats['VerbForm'] === 'Part' && node.token.feats['Voice'] === 'Pass';
      if ((node.token.upos === 'VERB' || node.token.upos === 'AUX') && !passiveParticiple) continue;
      const hasVerb = sentence.tokens.some(
        (t) => t.head === node.token.id && (t.deprel === 'cop' || t.deprel.startsWith('aux')),
      );
      if (hasVerb) continue;

      const subject = plan.find(
        (n) => n.token.head === node.token.id && n.token.deprel.startsWith('nsubj'),
      );
      /**
       * There has to be something for the copula to link. An ADJECTIVE or
       * ADVERB root is predicative on its own - "Дом большой", "Мне холодно",
       * "Где станция?" - but a NOMINAL root needs a subject, or it is a bare
       * phrase with no clause at all:
       *
       *   пять домов   ->  Pet JEST domov      (a noun phrase, not a sentence)
       *   два студента ->  Dva JEST studenti
       *
       * and a broken parse looks the same: Stanza reads "Я мою свою машину" as
       * a pronoun root with everything hanging off it, which produced
       * "JEST ja moju svoju mašinu".
       */
      const predicative = node.token.upos === 'ADJ' || node.token.upos === 'ADV';
      if (!predicative && !subject) continue;
      const person = subject ? subjectPerson(node.token, sentence) : '3';
      const number = subject?.feats.get('Number')?.value ?? 'Sing';
      const cop = realize({
        lemma: 'byti',
        xpos: 'v.intr. ipf.',
        feats: { Tense: 'Pres', Person: person, Number: number },
      });
      if (!cop.ok) {
        node.notes.push('could not build the copula this source omits');
        continue;
      }
      /**
       * Before the first SURVIVING word of the predicate phrase. Keyed to the
       * head it landed inside the phrase ("On najlěpši jest student"), and the
       * leftmost word can itself be deleted.
       */
      /**
       * The copula follows the first CONSTITUENT, which is the subject when the
       * subject comes first and the predicate itself when it is fronted:
       *
       *   On | jest doktor                  subject first
       *   Kniga ktoru ja čitaju | jest ...   subject plus its relative clause
       *   Kde | jest stancija?               fronted interrogative predicate
       *   U mene | sut dva brati             fronted prepositional phrase
       *   Mně | jest zimno                   dative experiencer, no subject
       *
       * Keying it to the predicate's head put it inside the phrase ("On
       * najlěpši jest student"); keying it to the phrase's first word made it
       * clause-initial ("Jest kde stancija?"); shifting by a single word split
       * a prepositional phrase ("U sut mene dva brati"). The first node outside
       * the opening constituent is the one place that is right in all five.
       */
      const opening = phraseOf(
        subject && subject.token.id < node.token.id ? subject.token.id : node.token.id,
        sentence,
      );
      const after = plan.find((n) => !opening.has(n.token.id)) ?? node;
      insertedCopulas.set(after.token.id, { form: cop.form, person, number });
    }
  }
}
