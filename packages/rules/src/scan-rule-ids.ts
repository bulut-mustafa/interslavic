import fs from 'node:fs';
import path from 'node:path';

/**
 * Every rule id written in the source, found by reading `decide(...)` calls.
 *
 * The registry test cannot rely on what the fixtures happen to emit. Four rules
 * were in the code and exercised by no fixture, so collecting emitted ids alone
 * left them uncited and invisible - a rule nobody runs is exactly the one most
 * likely to be wrong.
 *
 * The scan takes the SECOND argument of each call, which is the rule id, and
 * steps over strings and nested brackets so a comma inside the first argument
 * does not split it.
 */
export function scanRuleIds(roots: string[]): Set<string> {
  const ids = new Set<string>();
  const call = /\bdecide\s*(?:<[^>]*>)?\s*\(/g;
  for (const file of sourceFiles(roots)) {
    const s = fs.readFileSync(file, 'utf8');
    for (const m of s.matchAll(call)) {
      const id = secondArgument(s, m.index! + m[0].length);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function sourceFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'test') continue;
        walk(p);
      } else if (e.name.endsWith('.ts')) out.push(p);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return out;
}

/** The second comma-separated argument, if it is a plain string literal. */
function secondArgument(s: string, start: number): string | null {
  let i = start;
  let depth = 1;
  const args: string[] = [];
  let cur = '';
  while (i < s.length && depth > 0) {
    const ch = s[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      cur += ch;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') { cur += s[i]; i++; }
        cur += s[i]; i++;
      }
      cur += q; i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    if (ch === ',' && depth === 1) { args.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  args.push(cur);
  if (args.length < 2) return null;
  const m = /^'([A-Za-z][\w.']*)'$/.exec(args[1]!.trim());
  return m ? m[1]! : null;
}
