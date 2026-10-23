import { decide } from '../../../types/index.ts';
import { realize } from '../../../morph/src/realize.ts';
import { subjectOfClause, subjectPerson } from '../tree.ts';
import type { StageContext } from './context.ts';

/**
 * The standard past is the l-participle, which agrees in gender and number and
 * carries no person; the library's finite past is the literary imperfect. The
 * compound auxiliary is added for the 1st and 2nd person only.
 */
export function pastParticipleStage(ctx: StageContext): void {
  const { sentence, adapter, plan, insertedCopulas, pastAuxiliaries, conditionalVerbs } = ctx;

  // The library's FINITE past is the IMPERFECT (znaše), which the grammar calls
  // optional and literary. The standard past is the l-participle, which agrees
  // with the subject in GENDER and NUMBER and carries no person at all:
  //   znal / znala / znalo / znali
  // Requesting a finite past therefore produced "Ona ne znaše" where standard
  // Interslavic wants "Ona ne znala".
  for (const node of plan) {
    if (!node.entry) continue;
    if (node.feats.get('Tense')?.value !== 'Past') continue;
    if (node.feats.get('VerbForm')?.value !== 'Fin') continue;

    // A clause with no subject of its own - a purpose clause, say - agrees
    // with the subject of the clause it modifies, so walk up when there is no
    // nsubj child. Without this "Ona rabotaje že by pomagal..." came out
    // masculine for a feminine subject.
    const ownSubject = plan.find(
      (n) => n.token.head === node.token.id && n.token.deprel.startsWith('nsubj'),
    );
    const walkedUp = subjectOfClause(node.token, sentence);
    const subject =
      ownSubject ?? (walkedUp ? plan.find((n) => n.token.id === walkedUp.id) : undefined);
    // Gender is lexical for a noun subject and morphological for a pronoun.
    const gender =
      subject?.feats.get('Gender')?.value ??
      subject?.token.feats['Gender'] ??
      'Masc';
    const number = node.feats.get('Number')?.value ?? subject?.token.feats['Number'] ?? 'Sing';

    const why =
      'standard past is the l-participle, which agrees in gender and number ' +
      '(the finite past is the literary imperfect)';

    // The standard past is the COMPOUND past: byti + l-participle.
    //   ja jesm dělal · ty jesi dělal · on dělal · my jesmo dělali · oni dělali
    // The grammar omits the auxiliary only in the THIRD person ("usually
    // omitted, although this is not mandatory"), so 1st and 2nd person need it.
    const personForAux = subjectPerson(node.token, sentence);
    // A conditional already has its own auxiliary (byh/bys/by), so the
    // compound past's "jesm" must not be added on top of it.
    if (!conditionalVerbs.has(node.token.id) && (personForAux === '1' || personForAux === '2')) {
      const aux = realize({
        lemma: 'byti',
        xpos: 'v.intr. ipf.',
        feats: { Tense: 'Pres', Person: personForAux, Number: number },
      });
      if (aux.ok) {
        pastAuxiliaries.set(node.token.id, { form: aux.form, person: personForAux, number });
      } else {
        node.notes.push('could not build the past auxiliary for this person');
      }
    }

    node.feats.set('VerbForm', decide('Part', 'past.lParticiple', 'high', why));
    node.feats.set('Voice', decide('Act', 'past.lParticiple', 'high', why));
    node.feats.delete('Mood');
    node.feats.delete('Person'); // the l-participle has no person
    node.feats.set('Number', decide(number, 'past.lParticiple', 'certain', why));
    if (number !== 'Plur') {
      node.feats.set(
        'Gender',
        decide(
          gender,
          'agreement.pastParticiple',
          subject ? 'certain' : 'guess',
          subject
            ? `agrees with the subject (Gender = ${gender})`
            : 'no subject found - defaulting to masculine',
        ),
      );
    }
  }
}
