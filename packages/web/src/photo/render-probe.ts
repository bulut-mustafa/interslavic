import type { RenderRequest } from './render.ts';

/** A test hook: told of every request the page canvas makes of the renderer. Nothing sets it in the app. */
let probe: ((req: RenderRequest) => void) | null = null;
export const setRenderProbe = (f: ((req: RenderRequest) => void) | null): void => {
  probe = f;
};
export const probeRender = (req: RenderRequest): void => probe?.(req);
