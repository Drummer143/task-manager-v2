import { useRef, useState } from 'react';

export interface AsyncItemState {
  busy: boolean;
  error: string | null;
}

const IDLE: AsyncItemState = { busy: false, error: null };

const messageOf = (reason: unknown) =>
  reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : String(reason);

/**
 * Async menu items (spec 09): a Promise from onSelect keeps the menu open and
 * the item busy; a repeated choice of a busy item is ignored; success closes
 * the menu; a failure stays on the item until the next try or the next open.
 * If the menu was closed meanwhile (Esc), the operation goes on — its error is
 * the app's to show (a plaque), not the closed menu's.
 */
export const useAsyncItems = (close: () => void) => {
  const [states, setStates] = useState<Record<string, AsyncItemState>>({});
  const openRef = useRef(true);
  const busy = useRef(new Set<string>());

  const set = (id: string, state: AsyncItemState) => setStates((current) => ({ ...current, [id]: state }));

  /** Runs the item's action; returns whether the menu should close now. */
  const run = (id: string, action: (() => void | Promise<void>) | undefined) => {
    if (busy.current.has(id)) {
      return false;
    }

    const result = action?.();

    if (!(result instanceof Promise)) {
      return true;
    }

    busy.current.add(id);
    set(id, { busy: true, error: null });

    result.then(
      () => {
        busy.current.delete(id);
        set(id, IDLE);

        if (openRef.current) {
          close();
        }
      },
      (reason: unknown) => {
        busy.current.delete(id);
        set(id, { busy: false, error: openRef.current ? messageOf(reason) : null });
      },
    );

    return false;
  };

  return {
    run,
    stateOf: (id: string) => states[id] ?? IDLE,
    isBusy: (id: string) => busy.current.has(id),
    /** Follows the menu's open state: errors do not survive a reopen. */
    setOpen: (open: boolean) => {
      openRef.current = open;

      if (open) {
        setStates((current) => {
          const next: Record<string, AsyncItemState> = {};

          for (const [id, state] of Object.entries(current)) {
            if (state.busy) {
              next[id] = { busy: true, error: null };
            }
          }

          return next;
        });
      }
    },
  };
};
