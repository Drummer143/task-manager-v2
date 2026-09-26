import { useEffect, useRef, useState } from 'react';

/** The overlay on screen now: popover, menu, select — one at a time (spec 07). */
let active: { id: symbol; close: () => void } | null = null;

/**
 * One overlay at a time: opening a popover or a menu closes the one already
 * open — also when it opens from the keyboard, where no "click outside" would
 * have closed the first.
 */
export const useExclusiveOverlay = (open: boolean, close: () => void) => {
  const [id] = useState(() => Symbol('overlay'));
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (active && active.id !== id) {
      active.close();
    }

    active = { id, close: () => closeRef.current() };

    return () => {
      if (active?.id === id) {
        active = null;
      }
    };
  }, [open, id]);
};
