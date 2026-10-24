import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../src/conllu.ts';
import { translate } from '../src/pipeline.ts';
import { properNounXpos } from '../../rules/src/proper-nouns.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const validator = buildFullFormIndex(lex);
const g31 = () =>
  translate(
    parseConllu(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/parse/gold/g31.conllu'), 'utf8')),
    lex,
    { orthography: 'standard', validator },
  );

/**
 * "The first declension includes all masculine nouns ending in a consonant, as
 * well as neuter nouns ending in -o or -e. The second declension includes all
 * feminine nouns on -a." http://steen.free.fr/interslavic/nouns.html
 */
describe('a name the dictionary does not have', () => {
  it('takes its declension from its ending', () => {
    expect(properNounXpos('Ivan')).toBe('m.sg.');
    expect(properNounXpos('Marta')).toBe('f.sg.');
    expect(properNounXpos('Toronto')).toBe('n.sg.');
    // No stated pattern: left as it is.
    expect(properNounXpos('Peru')).toBeNull();
    expect(properNounXpos('Henry')).toBeNull();
  });

  it("is declined: van Steenbergen's dative", () => {
    expect(g31().text).toBe('Pjotr dal Ivanu svoju knigu');
  });

  it('says where its gender came from, and that its animacy is a guess', () => {
    const ivan = g31().words.find((w) => w.sourceForm === 'Ivan')!;
    // The name itself is carried over, as names are; only the ending is ours.
    expect(ivan.validation).toBe('untranslated');
    const gender = ivan.features.find((f) => f.name === 'Gender')!;
    expect(gender.ruleId).toBe('gender.fromEnding');
    const animacy = ivan.features.find((f) => f.name === 'Animacy')!;
    expect(animacy).toMatchObject({ value: 'Inan', confidence: 'guess', ruleId: 'animacy.unknownName' });
  });
});
