import { useEffect } from 'react';
import { useEscapeStore } from './store';

let listenersCount = 0;

// No typing-target guard here on purpose: Esc must cancel an in-place edit,
// which by definition happens while an input is focused (spec 04).
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') {
    return;
  }

  if (useEscapeStore.getState().handleEscape()) {
    event.preventDefault();
  }
};

const handleUnmount = () => {
  listenersCount--;

  if (listenersCount === 0) {
    window.removeEventListener('keydown', handleKeydown);
  }
};

/** Mount once (e.g. at the app root) to drive the Esc ladder. */
export const useListenEscape = () =>
  useEffect(() => {
    listenersCount++;

    if (listenersCount > 1) {
      return handleUnmount;
    }

    window.addEventListener('keydown', handleKeydown);

    return handleUnmount;
  }, []);
