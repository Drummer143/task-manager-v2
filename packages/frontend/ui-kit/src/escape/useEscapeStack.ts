import { useEffect } from 'react';
import { EscapeHandler, useEscapeStore } from './store';

/**
 * Registers one level of the Esc ladder while mounted (and while `enabled`).
 * Memoize `handler` so it does not re-register every render.
 */
export const useEscapeStack = (handler: EscapeHandler, enabled = true) =>
  useEffect(() => {
    if (!enabled) {
      return;
    }

    return useEscapeStore.getState().push(handler);
  }, [handler, enabled]);
