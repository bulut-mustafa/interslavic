import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex } from '../../lexicon/src/full-forms.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate, type Translation } from '../../engine/src/pipeline.ts';
import { DEFAULT_PARSER_URL, parseText, parserHealthy } from '../../engine/src/source/parse-client.ts';
import type { Orthography } from '../../morph/src/orthography.ts';
import { ENABLED_LANGS, type SourceLang } from '../../types/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const TSV = path.join(ROOT, 'packages/lexicon/data/raw/words.tsv');

const USAGE = `
usage:
  npm run isv -- "<text>" [--lang en|ru|uk] [--orth <orthography>]
  npm run isv -- <fixture.conllu> [--orth <orthography>]

options:
  --lang en|ru|uk  source language for free text (default: en)
  --orth           standard | etymological | simplified | cyrillic (default: standard)
  --brief          just the translation, no per-word analysis
  --no-validate    skip the full-form lexicon check (saves a few seconds)
  --parser <url>   parser service URL (default: ${DEFAULT_PARSER_URL})

Free text needs the parser service running:  npm run parser
`.trimStart();

function flag(args: string[], name: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function report(out: Translation, orth: string, brief: boolean): void {
  console.log(`\n  source   ${out.source}`);
  console.log(`  ${orth.padEnd(8)} ${out.text}`);
  if (out.validationRate !== null) {
    const pct = Math.round(out.validationRate * 100);
    const bad = out.words.filter((w) => w.validation === 'unvalidated').map((w) => w.surface);
    console.log(
      `  ${'checked'.padEnd(8)} ${pct}% of words found in the full-form lexicon` +
        (bad.length ? `  -- NOT FOUND: ${bad.join(', ')}` : ''),
    );
  }
  console.log('');
  if (brief) return;

  console.log('  per-word analysis');
  console.log(`  ${'-'.repeat(74)}`);
  for (const w of out.words) {
    const flagMark =
      w.validation === 'untranslated'
        ? '  [NOT TRANSLATED]'
        : w.validation === 'unvalidated'
          ? '  [NOT IN LEXICON]'
          : '';
    console.log(`  ${w.surface}   <- ${w.sourceForm}   [${w.lemma}, ${w.pos}]${flagMark}`);
    for (const f of w.features) {
      console.log(`      ${f.name} = ${f.value}  (${f.confidence})  <- ${f.because}`);
      for (const alt of f.alternatives) {
        console.log(`          alt: ${alt.value} - ${alt.because}`);
      }
    }
    if (w.aspect) {
      const declined = w.aspect.declined.length ? ` [declined: ${w.aspect.declined.join(', ')}]` : '';
      console.log(`      aspect chain -> ${w.aspect.chosen}${declined}`);
    }
    if (w.lexicalChoice) {
      console.log(`      word choice: ${w.lexicalChoice.because}`);
      if (w.lexicalChoice.rejected.length) {
        console.log(`      chose over: ${w.lexicalChoice.rejected.join('; ')}`);
      }
    }
    for (const n of w.notes) console.log(`      note: ${n}`);
    console.log('');
  }

  if (out.dropped.length) {
    console.log('  dropped: ' + out.dropped.map((d) => `"${d.form}" (${d.why})`).join(', '));
  }
  if (out.unknown.length) {
    console.log('  not in dictionary: ' + out.unknown.join(', '));
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((a, i) => {
    if (a.startsWith('--')) return false;
    const prev = args[i - 1];
    // Skip values consumed by a preceding space-separated flag.
    return !(prev && prev.startsWith('--') && !prev.includes('='));
  });

  if (args.length === 0 || args.includes('--help')) {
    console.log(USAGE);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const input = positional[0];
  if (!input) {
    console.log(USAGE);
    process.exit(2);
  }

  const orth = (flag(args, 'orth') ?? 'standard') as Orthography;
  const brief = args.includes('--brief');
  const lex = Lexicon.fromTsv(TSV);
  // The full-form lexicon is how the engine checks its own output; building it
  // takes a few seconds, so it can be skipped explicitly.
  const validator = args.includes('--no-validate') ? undefined : buildFullFormIndex(lex);

  // A path to a frozen fixture, or free text?
  if (input.endsWith('.conllu')) {
    const sentence = parseConllu(fs.readFileSync(input, 'utf8'));
    report(translate(sentence, lex, { orthography: orth, ...(validator ? { validator } : {}) }), orth, brief);
    return;
  }

  const lang = (flag(args, 'lang') ?? 'en') as SourceLang;
  if (!(ENABLED_LANGS as readonly string[]).includes(lang)) {
    console.error(`unsupported --lang "${lang}" (expected ${ENABLED_LANGS.join(', ')})`);
    process.exit(2);
  }
  const url = flag(args, 'parser') ?? DEFAULT_PARSER_URL;

  if (!(await parserHealthy(url))) {
    console.error(
      `\n  The parser service is not responding at ${url}.\n` +
        `  Start it in another terminal:\n\n      npm run parser\n\n` +
        `  The first request loads a language model and takes a few seconds.\n`,
    );
    process.exit(3);
  }

  const sentences = await parseText(input, lang, { url });
  for (const s of sentences) {
    report(translate(s, lex, { orthography: orth, ...(validator ? { validator } : {}) }), orth, brief);
  }
}

main().catch((err: unknown) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
