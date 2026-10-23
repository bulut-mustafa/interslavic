import type { Case, NumberFeat } from '../../types/index.ts';

/**
 * Numeral government, quoted from interslavic.fun/learn/grammar/numbers/:
 *
 *   "it is recommended to use the nominative singular after 1, the nominative
 *    plural after 2-4 and the genitive plural after 5 and more:
 *    jedin dom, dva domy, četyri domy, pet domov."
 *
 * Deliberately NOT implemented, because the source does not state it:
 *   - verb agreement after 5+ (research claimed 3sg neuter; unconfirmed)
 *   - compound numerals (21, 22...). Standard Slavic keys off the last digit,
 *     but the grammar only says "5 and more", so we follow the literal reading
 *     and flag it rather than inventing a rule.
 *   - behaviour in oblique positions. We apply this ONLY where the noun would
 *     be in a direct case (Nom/Acc); elsewhere the resolved case is kept, which
 *     is the conservative choice.
 */

const EN_NUMERALS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1000000,
};

const RU_NUMERALS: Record<string, number> = {
  ноль: 0, нуль: 0, один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3,
  четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
  девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
  сто: 100, тысяча: 1000, миллион: 1000000,
};

/** The integer a numeral token denotes, or null if we cannot tell. */
export function numeralValue(lemma: string, form: string, lang: string): number | null {
  const digits = form.replace(/[\s.,]/g, '');
  if (/^\d+$/.test(digits)) return Number(digits);

  const key = lemma.trim().toLowerCase();
  const table = lang === 'ru' ? RU_NUMERALS : EN_NUMERALS;
  return table[key] ?? null;
}

export interface NumeralGovernment {
  /**
   * The case the numeral IMPOSES on the counted noun, or null when the numeral
   * imposes none and the noun simply keeps the case its grammatical role gave
   * it. Only 5-and-up imposes a case.
   *
   * The grammar's "nominative singular after 1" describes the citation form:
   * "I see one house" is an accusative phrase, so forcing the nominative there
   * would be wrong. What 1 and 2-4 really fix is the NUMBER.
   */
  case: Case | null;
  number: NumberFeat;
  because: string;
  /** False when the source grammar does not actually cover this value. */
  stated: boolean;
}

export function governmentFor(value: number): NumeralGovernment {
  if (value === 1) {
    return {
      case: null,
      number: 'Sing',
      because: 'singular after 1 (jedin dom)',
      stated: true,
    };
  }
  if (value >= 2 && value <= 4) {
    return {
      case: null,
      number: 'Plur',
      because: 'plural after 2-4 (dva domy)',
      stated: true,
    };
  }
  return {
    case: 'Gen',
    number: 'Plur',
    because: 'genitive plural after 5 and more (pet domov)',
    // The grammar covers "5 and more" literally; it says nothing about how
    // compounds such as 22 behave, so flag those as not actually stated.
    stated: !(value > 20 && [1, 2, 3, 4].includes(value % 10)),
  };
}
