/**
 * The inline markup lessons are written in. Small on purpose: what a lesson
 * needs, and nothing a writer has to look up.
 *
 *   **bold**  *italic*  `code`  [text](url)  {Interslavic word}
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string }
  | { kind: 'isv'; text: string };

const PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\)|\{(.+?)\}/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'italic', text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'code', text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'link', text: m[4], url: m[5]! });
    else out.push({ kind: 'isv', text: m[6]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Plain text, for headings' anchors and for searching. */
export const plain = (text: string): string => parseInline(text).map((p) => p.text).join('');

/** A heading's anchor: "The six cases" -> "the-six-cases". */
export const anchor = (text: string): string =>
  plain(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
