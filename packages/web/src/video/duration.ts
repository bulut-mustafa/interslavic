/**
 * The length of a video in seconds. A recorded WebM often reports Infinity
 * until the browser has been made to look for its end; seeking far past it does
 * that, after which the real length is known and the video goes back to the start.
 */
export function resolveDuration(v: Pick<HTMLVideoElement, 'duration' | 'currentTime' | 'addEventListener' | 'removeEventListener'>): Promise<number> {
  if (Number.isFinite(v.duration)) return Promise.resolve(v.duration);
  return new Promise((resolve) => {
    const check = () => {
      if (!Number.isFinite(v.duration)) return;
      v.removeEventListener('durationchange', check);
      v.currentTime = 0;
      resolve(v.duration);
    };
    v.addEventListener('durationchange', check);
    v.currentTime = 1e101;
  });
}
