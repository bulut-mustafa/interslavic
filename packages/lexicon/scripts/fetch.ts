/**
 * Fetch a dated snapshot of the Interslavic dictionary.
 *
 * The upstream sheet is live and edited continuously, so the snapshot is
 * deliberately explicit: builds and tests must never silently change because
 * someone edited a row. Run this on purpose, then review the diff in
 * provenance.json before committing it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SPREADSHEET_ID = '1N79e_yVHDo-d026HljueuKJlAAdeELAiPzdFzdBuKbY';
const GID = '1987833874';
const URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=tsv&gid=${GID}`;

const EXPECTED_HEADER = [
  'id', 'isv', 'addition', 'partOfSpeech', 'type', 'en', 'sameInLanguages', 'genesis',
  'ru', 'be', 'uk', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'mk', 'bg', 'cu',
  'de', 'nl', 'eo', 'frequency', 'intelligibility', 'using_example',
];

const dataDir = path.resolve(import.meta.dirname, '../data');

async function main(): Promise<void> {
  process.stdout.write(`fetching ${URL}\n`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const text = await res.text();

  const lines = text.split('\n');
  const header = (lines[0] ?? '').trim().split('\t');

  // Fail loudly on schema drift rather than silently mis-parsing every row.
  const missing = EXPECTED_HEADER.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `dictionary schema drift - missing columns: ${missing.join(', ')}\n` +
        `got: ${header.join(', ')}`,
    );
  }

  const rowCount = lines.filter((l) => l.trim()).length - 1;
  fs.mkdirSync(path.join(dataDir, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'raw/words.tsv'), text);

  const provenance = {
    source: 'Medzuslovjansky slovnik (Interslavic dictionary)',
    url: URL,
    spreadsheetId: SPREADSHEET_ID,
    gid: GID,
    fetchedAt: new Date().toISOString().slice(0, 10),
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
    rowCount,
    licenseNote:
      'Wordlist traces to Jan van Steenbergen (steen.free.fr), whose pages state no ' +
      'licence. The dictionary app code is MIT. The wordlist itself carries no ' +
      'explicit license. Personal, non-commercial use with attribution only. ' +
      'The snapshot is NOT committed to this repo.',
    maintainers: ['Sergey Cherebedov (sonic16x)', 'Jan van Steenbergen (lexicon)'],
  };
  fs.writeFileSync(
    path.join(dataDir, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );

  process.stdout.write(`ok: ${rowCount} rows, ${provenance.bytes} bytes\n`);
  process.stdout.write(`sha256 ${provenance.sha256}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
