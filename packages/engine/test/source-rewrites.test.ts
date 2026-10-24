import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { rewriteExceptives, rewriteLightVerbs } from '../../rules/src/source-rewrites.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const gold = (id: string) =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, `fixtures/parse/gold/${id}.conllu`), 'utf8')),
    lex,
    { orthography: 'standard' },
  );

/** A hand-built "they took <extra> photos of the tulips" - only the shape matters. */
const took = (extra: string | null) =>
  parseConllu(
    [
      '# text = they took photos of the tulips',
      '# lang = en',
      '1\tthey\tthey\tPRON\tPRP\t_\t2\tnsubj\t_\t_',
      '2\ttook\ttake\tVERB\tVBD\tTense=Past|VerbForm=Fin\t0\troot\t_\t_',
      ...(extra ? [`3\t${extra}\t${extra}\tADJ\tJJ\t_\t4\tamod\t_\t_`] : []),
      '4\tphotos\tphoto\tNOUN\tNNS\tNumber=Plur\t2\tobj\t_\t_',
      '5\tof\tof\tADP\tIN\t_\t7\tcase\t_\t_',
      '6\tthe\tthe\tDET\tDT\t_\t7\tdet\t_\t_',
      '7\ttulips\ttulip\tNOUN\tNNS\tNumber=Plur\t4\tnmod\t_\t_',
      '',
    ].join('\n'),
  );

describe('a light verb and its noun as one verb', () => {
  it('makes "take photos of X" the verb "photograph" with X as its object', () => {
    const { sentence, absorbed } = rewriteLightVerbs(took(null));
    expect(sentence.tokens.find((t) => t.id === 2)?.lemma).toBe('photograph');
    expect(sentence.tokens.find((t) => t.id === 7)).toMatchObject({ head: 2, deprel: 'obj' });
    expect(sentence.tokens.map((t) => t.form)).toEqual(['they', 'took', 'the', 'tulips']);
    expect(absorbed.map((a) => a.form)).toEqual(['photos', 'of']);
  });

  it('declines when absorbing the noun would lose a word', () => {
    const parsed = took('beautiful');
    expect(rewriteLightVerbs(parsed).sentence).toBe(parsed);
  });

  it("reaches van Steenbergen's sentence, in both tenses", () => {
    expect(gold('g15').text).toContain('že by fotografovali tulipany');
    expect(gold('g34').text).toContain('že by fotografovali tulipany');
    expect(gold('g15').dropped.map((d) => d.form)).toContain('photos');
  });
});

/** "Ja myju jedino sebe „I wash nobody but myself"" - pronouns page. */
describe('"nobody but X" as "only X"', () => {
  const wash = (conj: string) =>
    parseConllu(
      [
        '# text = x',
        '# lang = en',
        '1\tI\tI\tPRON\tPRP\tCase=Nom|Number=Sing|Person=1|PronType=Prs\t2\tnsubj\t_\t_',
        '2\twash\twash\tVERB\tVBP\tTense=Pres|VerbForm=Fin\t0\troot\t_\t_',
        '3\tnobody\tnobody\tPRON\tNN\tNumber=Sing|PronType=Neg\t2\tobj\t_\t_',
        `4\t${conj}\t${conj}\tCCONJ\tCC\t_\t5\tcc\t_\t_`,
        '5\tmyself\tmyself\tPRON\tPRP\tCase=Acc|Number=Sing|Person=1|PronType=Prs|Reflex=Yes\t3\tconj\t_\t_',
        '',
      ].join('\n'),
    );

  it('turns the negative into "only" on the exception, which takes its place', () => {
    const { sentence, absorbed } = rewriteExceptives(wash('but'));
    expect(sentence.tokens.find((t) => t.id === 3)).toMatchObject({ lemma: 'only', upos: 'ADV', head: 5, deprel: 'advmod' });
    expect(sentence.tokens.find((t) => t.id === 5)).toMatchObject({ head: 2, deprel: 'obj' });
    expect(absorbed.map((a) => a.form)).toEqual(['but']);
  });

  it('leaves any other coordination alone', () => {
    const parsed = wash('and');
    expect(rewriteExceptives(parsed).sentence).toBe(parsed);
  });

  it("reaches van Steenbergen's sentence, with no negation left", () => {
    expect(gold('g30').text).toBe('Ja myju jedino sebe');
  });
});
