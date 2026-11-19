/**
 * A small picture of a photo file, for the strip of pages, made without keeping
 * the photo. Pictures added together are done one at a time, so that a handful
 * of large photos is never decoded at once.
 */

let queue: Promise<unknown> = Promise.resolve();

function render(file: File, longest: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    const done = (v: string | undefined) => {
      URL.revokeObjectURL(url);
      el.onload = el.onerror = null;
      el.src = '';
      resolve(v);
    };
    el.onload = () => {
      try {
        const k = Math.min(1, longest / Math.max(el.naturalWidth, el.naturalHeight, 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(el.naturalWidth * k));
        c.height = Math.max(1, Math.round(el.naturalHeight * k));
        c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
        const url2 = c.toDataURL('image/jpeg', 0.7);
        c.width = 0; // let the little canvas go at once
        done(typeof url2 === 'string' && url2.startsWith('data:') ? url2 : undefined);
      } catch {
        done(undefined);
      }
    };
    el.onerror = () => done(undefined);
    el.src = url;
  });
}

/** A JPEG data address no larger than `longest` pixels on its long side, or undefined where the browser cannot make one. */
export function thumbnailOf(file: File, longest = 240): Promise<string | undefined> {
  const mine = queue.then(() => render(file, longest));
  queue = mine.catch(() => undefined);
  return mine;
}
