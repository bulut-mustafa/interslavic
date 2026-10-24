/**
 * The declension of a proper noun the dictionary does not have, read off its
 * ending. Without it "Pjotr gave Ivan his book" lost its dative: `Ivan` was
 * passed through unchanged where the page writes "Pjotr dal Ivanu".
 *
 * "The first declension includes all masculine nouns ending in a consonant, as
 * well as neuter nouns ending in -o or -e. The second declension includes all
 * feminine nouns on -a." - http://steen.free.fr/interslavic/nouns.html
 *
 * A name ending in anything else ("Peru", "Henry") has no stated pattern and
 * stays as it is. Proper nouns are singular, as the dictionary marks its own
 * (`London` m.sg., `Moskva` f.sg.).
 */
const CONSONANT = /[bcčćdđfghjklľmnńprŕsštťvzž]$/i;

export function properNounXpos(name: string): string | null {
  if (CONSONANT.test(name)) return 'm.sg.';
  if (/a$/i.test(name)) return 'f.sg.';
  if (/[oe]$/i.test(name)) return 'n.sg.';
  return null;
}
