import { useEffect, useState } from 'react';

export default function useFutureQuestionClock(openingTimes: number[]) {
  const [clock, setClock] = useState(Date.now);
  const now = Math.max(clock, Date.now());
  const nextOpening = openingTimes.reduce((next, opens) => opens > now ? Math.min(next, opens) : next, Infinity);

  useEffect(() => {
    if (!Number.isFinite(nextOpening)) return;
    const remaining = nextOpening - Date.now();
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(Math.max(1, remaining), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [nextOpening, clock]);

  useEffect(() => {
    const syncClock = () => setClock(Date.now());
    document.addEventListener('visibilitychange', syncClock);
    window.addEventListener('focus', syncClock);
    return () => {
      document.removeEventListener('visibilitychange', syncClock);
      window.removeEventListener('focus', syncClock);
    };
  }, []);

  return now;
}
