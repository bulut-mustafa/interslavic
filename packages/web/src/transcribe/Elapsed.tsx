import { useEffect, useState } from 'react';

/** How long something has been going on, ticking each second from the moment it appears: a sign that it has not stopped. */
export const clockOf = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="elapsed">{clockOf(s)} so far</span>;
}
