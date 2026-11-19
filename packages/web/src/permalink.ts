import { SITE } from './meta.ts';

/**
 * An address that opens a page with the user's text already in it. Built only
 * when the user asks for the link; the text travels in the address and nowhere
 * else (analytics never see it).
 */
export function permalink(path: string, params: Record<string, string>): string {
  const url = new URL(path, typeof window === 'undefined' ? SITE : window.location.origin);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}
