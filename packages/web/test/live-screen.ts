import { within } from '@testing-library/react';

/**
 * Queries bound to the live document. Testing Library's `screen` is bound to
 * the body it first saw, and the suite runs with `isolate: false`
 * (vitest.config.ts), so a file that runs after another jsdom file can find it
 * pointing at a stale page.
 */
export const screen = new Proxy({} as ReturnType<typeof within>, {
  get: (_t, prop) => (within(document.body) as never)[prop as never],
});
