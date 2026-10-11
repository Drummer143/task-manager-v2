import { useEffect, useEffectEvent } from 'react';

/**
 * An overlay follows its trigger while the page scrolls; once the trigger
 * leaves the visible area, the overlay closes (spec: Popover · position) —
 * nothing hangs over a place the user no longer sees.
 */
export const useCloseWhenDetached = (open: boolean, getTrigger: () => Element | null, close: () => void) => {
  const onDetached = useEffectEvent(close);
  // getTrigger reads the DOM by a stable id: only `open` matters
  const triggerNow = useEffectEvent(getTrigger);

  useEffect(() => {
    const trigger = triggerNow();

    if (!open || !trigger || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) {
        onDetached();
      }
    });

    observer.observe(trigger);

    return () => observer.disconnect();
  }, [open]);
};
