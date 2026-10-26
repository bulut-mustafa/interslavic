import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.tsx';
import { headTags, pageMeta, robotsTxt, ROUTES, sitemapXml } from './meta.ts';
import { setServerPath } from './router.tsx';

/**
 * Build-time rendering: each page becomes a real HTML file with its content
 * and its own head, so a crawler or a link preview that runs no JavaScript
 * still sees the lesson. The browser then renders the same page over it.
 */
export function pageHtml(template: string, path: string): string {
  setServerPath(path);
  const body = renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const withHead = template.replace(/<title>[^<]*<\/title>/, headTags(pageMeta(path)));
  if (withHead === template) throw new Error('template has no <title> to replace');
  return withHead.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

export { ROUTES, robotsTxt, sitemapXml };
