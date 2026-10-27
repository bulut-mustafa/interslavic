/**
 * Latin letters typed inside a Cyrillic word. They look identical - "вaс",
 * "Вiн" - and are common in real input from mixed keyboard layouts (Tatoeba's
 * Ukrainian has several), but no dictionary gloss contains them, so the word
 * came through untranslated. Inside a word that already has Cyrillic letters,
 * each look-alike is replaced by the Cyrillic letter it imitates. A word with no
 * Cyrillic in it is left alone, so a Latin name or brand is never touched.
 *
 * Latin "i" imitates Ukrainian "і"; Russian has no such letter, so it is only
 * replaced for Ukrainian.
 */
const LOOKALIKES: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у',
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
};
const UKRAINIAN_LOOKALIKES: Record<string, string> = { ...LOOKALIKES, i: 'і', I: 'І' };

const CYRILLIC = /[Ѐ-ӿ]/;

export function fixMixedScript(text: string, lang: string): string {
  if (lang !== 'ru' && lang !== 'uk') return text;
  const table = lang === 'uk' ? UKRAINIAN_LOOKALIKES : LOOKALIKES;
  return text.replace(/[\p{L}'’ʼ]+/gu, (word) =>
    CYRILLIC.test(word) ? [...word].map((ch) => table[ch] ?? ch).join('') : word,
  );
}
