/**
 * After `vite build`: write every page as its own HTML file, plus 404.html,
 * sitemap.xml and robots.txt, into packages/web/dist.
 *
 *   npm run web:build      (builds the page, the server entry, then this)
 *
 * The rendering itself lives in src/entry-server.tsx, which the tests import
 * directly, so what is tested is what is written here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WEB = path.resolve(import.meta.dirname, '..');
const DIST = path.join(WEB, 'dist');
const entry = fs.readdirSync(path.join(WEB, 'dist-ssr')).find((f) => /^entry-server\.m?js$/.test(f));
if (!entry) throw new Error('no dist-ssr/entry-server.js - run the SSR build first');
const ssr = (await import(pathToFileURL(path.join(WEB, 'dist-ssr', entry)).href)) as {
  pageHtml(template: string, path: string): string;
  ROUTES: string[];
  sitemapXml(): string;
  robotsTxt(): string;
};

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const write = (rel: string, text: string) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

for (const route of ssr.ROUTES) {
  write(route === '/' ? 'index.html' : `${route.slice(1)}/index.html`, ssr.pageHtml(template, route));
}
write('404.html', ssr.pageHtml(template, '/404'));
write('sitemap.xml', ssr.sitemapXml());
write('robots.txt', ssr.robotsTxt());
console.log(`prerendered ${ssr.ROUTES.length} pages, 404.html, sitemap.xml, robots.txt`);
