import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pageHtml, robotsTxt, ROUTES, sitemapXml } from '../src/entry-server.tsx';
import { LESSONS } from '../src/learn/lessons.ts';

/**
 * What a crawler or a link preview receives without running JavaScript: the
 * prerendered page (scripts/prerender.ts writes exactly these strings).
 * Google: "not all bots can run JavaScript", and each page needs its own
 * title and description.
 */

const template = fs.readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8');
const pages = new Map(ROUTES.map((r) => [r, pageHtml(template, r)]));
const tag = (html: string, re: RegExp) => html.match(re)?.[1];
const title = (html: string) => tag(html, /<title>([^<]*)<\/title>/);
const description = (html: string) => tag(html, /<meta name="description" content="([^"]*)"/);
const text = (html: string) => html.split('<div id="root">')[1]!.replace(/<[^>]+>/g, ' ');

describe('every page is real HTML with its own head', () => {
  it('has a page for the home, the phrasebook and every lesson', () => {
    expect(ROUTES).toEqual(['/', '/phrasebook', ...LESSONS.map((l) => `/learn/${l.slug}`)]);
  });

  it('gives each page a unique title and description', () => {
    const titles = [...pages.values()].map(title);
    const descriptions = [...pages.values()].map(description);
    expect(titles.every(Boolean)).toBe(true);
    expect(descriptions.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(pages.size);
    expect(new Set(descriptions).size).toBe(pages.size);
  });

  it('takes a lesson\'s description from its own summary, not added words', () => {
    for (const l of LESSONS) {
      const html = pages.get(`/learn/${l.slug}`)!;
      expect(title(html)).toBe(`${l.title} - Learn Interslavic`);
      expect(description(html)).toBe(l.summary.replace(/"/g, '&quot;'));
    }
  });

  it('names one canonical address and has one h1', () => {
    for (const [route, html] of pages) {
      expect(html).toContain(`<link rel="canonical" href="https://interslavic.web.app${route}" />`);
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    }
  });

  it('carries the lesson itself in the HTML, not an empty root', () => {
    const cases = text(pages.get('/learn/cases')!);
    expect(cases).toContain('Why nouns change their endings');
    expect(cases.length).toBeGreaterThan(3000);
  });

  it('marks Interslavic text as Interslavic, and Cyrillic as Cyrillic', () => {
    const nouns = pages.get('/learn/nouns')!;
    expect(nouns).toMatch(/lang="isv"/);
    expect(nouns).toMatch(/lang="isv-Cyrl"/);
  });

  it('describes only what the page is: a breadcrumb on lessons, nothing invented', () => {
    const html = pages.get('/learn/cases')!;
    expect(html).toContain('"@type":"BreadcrumbList"');
    for (const page of pages.values()) {
      expect(page).not.toMatch(/"@type":"(FAQPage|Course|AggregateRating|Review)"/);
      expect(page).not.toMatch(/name="keywords"/);
    }
  });
});

describe('the not-found page, sitemap and robots.txt', () => {
  it('renders "not found" for an unknown address, and keeps it out of the index', () => {
    const html = pageHtml(template, '/404');
    expect(text(html)).toContain('Page not found');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
  });

  it('lists exactly the pages in the sitemap', () => {
    const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(ROUTES.map((r) => `https://interslavic.web.app${r}`));
  });

  it('points robots.txt at the sitemap and keeps the API out', () => {
    expect(robotsTxt()).toContain('Sitemap: https://interslavic.web.app/sitemap.xml');
    expect(robotsTxt()).toContain('Disallow: /api/');
  });
});
