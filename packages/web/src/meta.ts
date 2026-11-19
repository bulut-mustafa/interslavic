import { LESSONS } from './learn/lessons.ts';
import { TOOLS, toolPath } from './studio/tools.tsx';

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
export const ROUTES: string[] = ['/', '/studio', ...TOOLS.map(toolPath), '/phrasebook', ...LESSONS.map((l) => `/learn/${l.slug}`)];

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
  if (clean === '/studio') {
    return {
      path: clean,
      title: 'Interslavic Studio - tools for learning, teaching and making',
      description:
        'One workspace of Interslavic tools: edit photos and videos with translated text, turn recordings into subtitles, translate subtitles, learn from a video, and print worksheets.',
      index: true,
    };
  }
  if (clean === '/studio/watch') {
    return {
      path: clean,
      title: 'Learn Interslavic from a video',
      description:
        'Watch a video you have with its Interslavic subtitles: tap any word for its dictionary form and meaning, repeat a line, slow it down, and save sentences for Anki. The video stays on your device.',
      index: true,
    };
  }
  if (clean === '/studio/recording') {
    return {
      path: clean,
      title: 'Turn a recording into subtitles - in your browser',
      description:
        'Transcribe the speech in an English, Russian or Ukrainian audio or video file into subtitles on your own device, then translate them into Interslavic. Nothing is uploaded.',
      index: true,
    };
  }
  if (clean === '/studio/video') {
    return {
      path: clean,
      title: 'Video editor - cut a video and add styled, translated text',
      description:
        'Open a video, cut and rearrange it, add styled text or subtitles, translate the text into Interslavic, and save the result. The video never leaves your device.',
      index: true,
    };
  }
  if (clean === '/studio/photo') {
    return {
      path: clean,
      title: 'Photo editor - change the text in a picture, into Interslavic',
      description:
        'Open a picture with text, find the writing on your own device, change it by hand or translate it into Interslavic, move and restyle it, and save the result. The photo is never uploaded.',
      index: true,
    };
  }
  if (clean === '/studio/subtitles') {
    return {
      path: clean,
      title: 'Translate subtitles (.srt) to Interslavic',
      description:
        'Upload English, Russian or Ukrainian subtitles and download them in Interslavic with the same timing, with the lines the translator is unsure of marked for review.',
      index: true,
    };
  }
  if (clean === '/studio/worksheets') {
    return {
      path: clean,
      title: 'Printable Interslavic worksheets for teachers',
      description:
        'Build a printable Interslavic worksheet from the lessons: fill-in and multiple-choice exercises, blank inflection tables and phrase translation, with an answer key.',
      index: true,
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
