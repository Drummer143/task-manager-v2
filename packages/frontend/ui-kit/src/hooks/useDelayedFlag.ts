import { useEffect, useRef, useState } from 'react';
import { raw } from '../tokens';

export interface DelayedFlagOptions {
  /** Hold off showing for this long; a shorter `active` never shows. */
  delay?: number;
  /** Once shown, stay visible at least this long. */
  minVisible?: number;
}

export const useDelayedFlag = (
  active: boolean,
  {
    delay = raw['spinner-delay'],
    minVisible = raw['spinner-min'],
  }: DelayedFlagOptions = {},
) => {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (active && shownAt.current !== null) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      timer = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delay);
    } else if (shownAt.current !== null) {
      const left = minVisible - (performance.now() - shownAt.current);

      timer = setTimeout(
        () => {
          shownAt.current = null;
          setVisible(false);
        },
        Math.max(0, left),
      );
    }

    return () => clearTimeout(timer);
  }, [active, delay, minVisible]);

  return visible;
};
