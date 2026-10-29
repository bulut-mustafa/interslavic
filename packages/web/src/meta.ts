import { LESSONS } from './learn/lessons.ts';

/**
 * What each page says about itself to search engines and link previews: its
 * title, a one-line description, and its one address. Built from text the
 * pages already show - a lesson's description is its own summary - so the
 * metadata can never drift from the page or say more than it does.
 *
 * Used twice, so both always agree: by the build-time prerender for the HTML
 * head, and in the browser to update the title on navigation.
 */

export const SITE = 'https://interslavic.web.app';
const SITE_NAME = 'Medžuslovjansky';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** False for the "not found" page, which must not be indexed. */
  index: boolean;
  /** Structured data, only of kinds the page really is. */
  jsonLd?: object;
}

/** Every page with an address of its own, in sitemap order. */
export const ROUTES: string[] = ['/', '/phrasebook', ...LESSONS.map((l) => `/learn/${l.slug}`)];

const NOT_FOUND: PageMeta = {
  path: '/404',
  title: `Page not found - ${SITE_NAME}`,
  description: 'There is no page at this address.',
  index: false,
};

export function pageMeta(path: string): PageMeta {
  const clean = path.length > 1 ? path.replace(/\/$/, '') : path;
  if (clean === '/') {
    return {
      path: '/',
      title: 'Interslavic translator - English, Russian and Ukrainian to Medžuslovjansky',
      description:
        'Translate English, Russian or Ukrainian into Interslavic, with the case, aspect and form of every word explained - and lessons on the grammar.',
      index: true,
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${SITE}/` },
    };
  }
  if (clean === '/phrasebook') {
    return {
      path: clean,
      title: 'Interslavic phrasebook',
      description:
        'Everyday Interslavic phrases in Latin and Cyrillic - greetings, politeness, directions, food and shopping - with flashcards.',
      index: true,
    };
  }
  const lesson = LESSONS.find((l) => `/learn/${l.slug}` === clean);
  if (lesson) {
    return {
      path: clean,
      title: `${lesson.title} - Learn Interslavic`,
      description: lesson.summary,
      index: true,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Learn', item: `${SITE}/learn/${LESSONS[0]!.slug}` },
          { '@type': 'ListItem', position: 2, name: lesson.title, item: `${SITE}${clean}` },
        ],
      },
    };
  }
  return NOT_FOUND;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The `<head>` tags for one page. */
export function headTags(m: PageMeta): string {
  const url = `${SITE}${m.path}`;
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
  ];
  if (m.index) {
    tags.push(
      `<link rel="canonical" href="${url}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:title" content="${esc(m.title)}" />`,
      `<meta property="og:description" content="${esc(m.description)}" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta name="twitter:card" content="summary" />`,
    );
  } else {
    tags.push('<meta name="robots" content="noindex" />');
  }
  if (m.jsonLd) {
    // "<" escaped so lesson text can never close the script element.
    tags.push(`<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

export function sitemapXml(): string {
  const urls = ROUTES.map((r) => `  <url><loc>${SITE}${r}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;
}
