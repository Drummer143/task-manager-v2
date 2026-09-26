import { useEffect, useState, type RefObject } from 'react';
import { raw } from '../tokens';

/** The exit animation's length in ms, or 0 when there is none. */
const exitDuration = (node: HTMLElement) => {
  const style = getComputedStyle(node);

  if (!style.animationName || style.animationName === 'none') {
    return 0;
  }

  const seconds = (value: string) => (value.trim().endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value));

  return (seconds(style.animationDuration) + seconds(style.animationDelay || '0s')) * 1000 || 0;
};

/**
 * Keeps an overlay in the DOM while it animates out (spec 12: an exit is
 * shorter than the entry, but it is there). Mounted on open at once — in the
 * same render, so the entry animation starts on the first frame; unmounted
 * after its exit animation ends, or at once when there is none (tests). A
 * timer of the animation's own length backs the event up: a background tab
 * may never deliver animationend, and a closed overlay must not linger.
 */
export const usePresence = (open: boolean, ref: RefObject<HTMLElement | null>) => {
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    const node = ref.current;

    if (open || !mounted) {
      return;
    }

    const duration = node ? exitDuration(node) : 0;

    if (!node || duration === 0) {
      setMounted(false);
      return;
    }

    const unmount = () => setMounted(false);
    const done = (event: AnimationEvent) => {
      if (event.target === node) {
        unmount();
      }
    };
    // Slack past the animation's own end: a state beat (90 ms).
    const fallback = setTimeout(unmount, duration + raw['dur-state']);

    node.addEventListener('animationend', done);
    node.addEventListener('animationcancel', done);

    return () => {
      clearTimeout(fallback);
      node.removeEventListener('animationend', done);
      node.removeEventListener('animationcancel', done);
    };
  }, [open, mounted, ref]);

  return mounted;
};
