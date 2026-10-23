import type { ParsedSentence, UdToken } from '../../types/index.ts';

/**
 * CoNLL-U text is the FIXTURE format, not the wire format. Freezing parser
 * output as text means the whole TS suite runs with no Python, no models and no
 * network - and a parser upgrade becomes a reviewable diff instead of a
 * mystery regression.
 */
export function parseConllu(text: string): ParsedSentence {
  const tokens: UdToken[] = [];
  let sentText = '';
  let lang: 'en' | 'ru' = 'en';

  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (l.startsWith('#')) {
      const m = l.match(/^#\s*(\w+)\s*=\s*(.*)$/);
      if (m?.[1] === 'text') sentText = m[2] ?? '';
      if (m?.[1] === 'lang' && (m[2] === 'en' || m[2] === 'ru')) lang = m[2];
      continue;
    }
    const f = l.split('\t');
    if (f.length < 8) continue;
    const id = Number(f[0]);
    if (!Number.isInteger(id)) continue; // skip multiword-token ranges like "3-4"

    const feats: Record<string, string> = {};
    if (f[5] && f[5] !== '_') {
      for (const kv of f[5].split('|')) {
        const [k, v] = kv.split('=');
        if (k && v) feats[k] = v;
      }
    }
    tokens.push({
      id,
      form: f[1] ?? '',
      lemma: f[2] ?? '',
      upos: f[3] ?? 'X',
      xpos: f[4] ?? '',
      feats,
      head: Number(f[6]) || 0,
      deprel: f[7] ?? 'dep',
    });
  }
  return { text: sentText, lang, tokens };
}
