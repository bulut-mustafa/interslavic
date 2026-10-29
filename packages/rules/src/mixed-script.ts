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
 *
 * A one-letter word is all look-alike, so the rule above never reaches it: the
 * Ohienko Bible as published (api.getbible.net, Mt 6:13) opens "I не введи нас"
 * with a Latin "I" for the conjunction "І". A single look-alike letter between
 * Cyrillic words - or opening a sentence that goes on in Cyrillic - is a word of
 * that sentence, not a Latin name.
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
  const words = [...text.matchAll(/[\p{L}'’ʼ]+/gu)];
  return text.replace(/[\p{L}'’ʼ]+/gu, (word, offset: number) => {
    if (CYRILLIC.test(word)) return [...word].map((ch) => table[ch] ?? ch).join('');
    if (word.length !== 1 || !table[word]) return word;
    const i = words.findIndex((m) => m.index === offset);
    const before = words[i - 1]?.[0];
    const after = words[i + 1]?.[0];
    const cyrillic = (w: string | undefined) => w === undefined || CYRILLIC.test(w);
    return after !== undefined && cyrillic(before) && cyrillic(after) ? table[word] : word;
  });
}
