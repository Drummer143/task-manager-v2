import { useEffect, useRef } from 'react';

/**
 * A toast's time on screen: `duration` ms of being seen, then `onExpire`.
 * Paused time does not count (hover, focus inside, a hidden tab). A new
 * duration starts over — a progress toast that became an undo gets its full
 * window. `null` — it does not expire (an error, a progress).
 */
export const useLifetime = (duration: number | null, paused: boolean, onExpire: () => void) => {
  const expire = useRef(onExpire);
  const remaining = useRef(duration);
  const forDuration = useRef(duration);

  expire.current = onExpire;

  if (forDuration.current !== duration) {
    forDuration.current = duration;
    remaining.current = duration;
  }

  useEffect(() => {
    const left = remaining.current;

    if (left === null || paused) {
      return;
    }

    const startedAt = performance.now();
    const timer = setTimeout(() => expire.current(), left);

    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, left - (performance.now() - startedAt));
    };
  }, [duration, paused]);
};
