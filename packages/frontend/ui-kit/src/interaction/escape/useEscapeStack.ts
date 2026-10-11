import { useEffect, useLayoutEffect, useRef } from 'react';
import { EscapeHandler, useEscapeStore } from './store';

/**
 * Registers one level of the Esc ladder while mounted (and while `enabled`).
 *
 * Pushed once per enabling: a new `handler` every render is fine, Esc calls the latest one.
 * Pushing again would move this level above the ones opened after it.
 */
export const useEscapeStack = (handler: EscapeHandler, enabled = true) => {
  const latest = useRef(handler);

  useLayoutEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return useEscapeStore.getState().push(() => latest.current());
  }, [enabled]);
};
