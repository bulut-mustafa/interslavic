import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

describe('mobile shell', () => {
  it('uses viewport-fit=cover and keeps zoom enabled', () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).not.toMatch(/user-scalable=no|maximum-scale/);
  });

  it('keeps every :hover rule inside a hover media query', () => {
    // Strip comments, then walk the braces, tracking whether we are inside (hover: hover).
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const stack: boolean[] = [];
    let buf = '';
    const bad: string[] = [];
    for (const ch of src) {
      if (ch === '{') {
        stack.push(/hover:\s*hover/.test(buf) || stack.some(Boolean));
        if (!buf.trim().startsWith('@') && /:hover/.test(buf) && !stack.some(Boolean)) bad.push(buf.trim());
        buf = '';
      } else if (ch === '}') {
        stack.pop();
        buf = '';
      } else if (ch === ';') buf = '';
      else buf += ch;
    }
    expect(bad).toEqual([]);
  });

  it('has a vh fallback before every svh height', () => {
    const lines = css.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('100svh')) expect(lines[i - 1]).toBe(l.replace('100svh', '100vh'));
    });
  });

  it('has no transition: all', () => {
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
