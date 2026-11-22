/**
 * Static mobile audit: reads source, never a screen. Rules and sources are in docs/mobile.md.
 * Run: npm run audit:mobile [-- --verbose]. Exits 1 if any "error" finding remains.
 * It can only find what text shows; real phones decide the rest.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../packages/web/', import.meta.url).pathname;
const verbose = process.argv.includes('--verbose');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'test' || n === 'docs') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?|html)$/.test(n)) out.push(p);
  }
  return out;
};

interface Finding { rule: string; level: 'error' | 'warn'; file: string; line: number; text: string }
const found: Finding[] = [];
const add = (rule: string, level: Finding['level'], file: string, line: number, text: string) =>
  found.push({ rule, level, file: relative(ROOT, file), line, text: text.trim().slice(0, 110) });

const files = walk(ROOT);
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const isCss = f.endsWith('.css');
  // Which lines sit inside @media (hover: hover) ... (tracked by brace depth).
  let hoverDepth = 0;
  let depth = 0;
  let hoverStart = -1;
  lines.forEach((l, i) => {
    const n = i + 1;
    if (isCss) {
      if (/@media[^{]*\(hover:\s*hover\)/.test(l)) { hoverStart = depth; hoverDepth = 1; }
      for (const ch of l) { if (ch === '{') depth++; if (ch === '}') { depth--; if (hoverDepth && depth <= hoverStart) hoverDepth = 0; } }
      if (/:hover/.test(l) && !hoverDepth && !/@media/.test(l)) add('hover-outside-media', 'warn', f, n, l);
      if (/\b100vh\b/.test(l) && !/dvh|svh|lvh/.test(l)) add('100vh', 'warn', f, n, l);
      if (/transition:\s*all\b/.test(l)) add('transition-all', 'error', f, n, l);
      if (/transition(-property)?:[^;]*\b(width|height|top|left|right|bottom)\b/.test(l)) add('layout-transition', 'warn', f, n, l);
    }
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(l)) add('zoom-disabled', 'error', f, n, l);
    if (!isCss && /onMouseEnter|onMouseOver|onMouseLeave/.test(l)) add('mouse-only-handler', 'warn', f, n, l);
  });
  if (f.endsWith('index.html') && !/viewport-fit=cover/.test(src)) add('viewport-fit', 'error', f, 1, 'viewport meta lacks viewport-fit=cover');
  if (!isCss && /onPointerDown|onPointerMove/.test(src)) {
    const dir = f.slice(0, f.lastIndexOf('/'));
    const cssText = files.filter((c) => c.endsWith('.css') && (c.startsWith(dir) || c.endsWith('styles.css'))).map((c) => readFileSync(c, 'utf8')).join('\n');
    if (!/touch-action/.test(src) && !/touch-action/.test(cssText)) add('pointer-without-touch-action', 'error', f, 1, 'uses pointer drags but no touch-action anywhere nearby');
  }
}

// CSS rule blocks: fixed/sticky to an edge without a safe-area inset; inputs below 16px.
for (const f of files.filter((x) => x.endsWith('.css'))) {
  const src = readFileSync(f, 'utf8');
  const blocks = src.matchAll(/([^{}@]+)\{([^{}]*)\}/g);
  for (const m of blocks) {
    const sel = m[1]!.trim();
    const body = m[2]!;
    const line = src.slice(0, m.index).split('\n').length;
    if (/position:\s*(fixed|sticky)/.test(body) && /\b(bottom|top|left|right)\s*:\s*0\b/.test(body) && !/safe-area-inset/.test(body)) add('edge-without-safe-area', 'warn', f, line, sel);
    if (/\b(input|select|textarea)\b/.test(sel)) {
      const fs = body.match(/font-size:\s*([\d.]+)(px|rem|em)/);
      if (fs) {
        const px = fs[2] === 'px' ? +fs[1]! : +fs[1]! * 16;
        if (px < 16) add('input-font-below-16', 'warn', f, line, `${sel} { font-size: ${fs[1]}${fs[2]} }`);
      }
    }
  }
}

const by = new Map<string, Finding[]>();
for (const x of found) by.set(x.rule, [...(by.get(x.rule) ?? []), x]);
console.log(`Mobile audit of ${files.length} files`);
for (const [rule, xs] of [...by].sort()) {
  console.log(`${xs[0]!.level === 'error' ? 'ERROR' : 'warn '}  ${rule}: ${xs.length}`);
  if (verbose || xs[0]!.level === 'error') for (const x of xs.slice(0, verbose ? 999 : 8)) console.log(`        ${x.file}:${x.line}  ${x.text}`);
}
const errors = found.filter((x) => x.level === 'error').length;
console.log(`\n${errors} errors, ${found.length - errors} warnings`);
process.exit(errors ? 1 : 0);
