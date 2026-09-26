import { useEffect, useRef } from 'react';

/**
 * An overlay follows its trigger while the page scrolls; once the trigger
 * leaves the visible area, the overlay closes (spec: Popover · position) —
 * nothing hangs over a place the user no longer sees.
 */
export const useCloseWhenDetached = (open: boolean, getTrigger: () => Element | null, close: () => void) => {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const trigger = getTrigger();

    if (!open || !trigger || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) {
        closeRef.current();
      }
    });

    observer.observe(trigger);

    return () => observer.disconnect();
    // getTrigger reads the DOM by a stable id — only `open` matters.
  }, [open]);
};
