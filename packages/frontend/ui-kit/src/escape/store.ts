import { create } from 'zustand';

/**
 * One handler in the Esc ladder (spec 04). Return `false` to pass (this level
 * did not apply) so the next level down gets a chance; return `true` or nothing
 * to consume the Escape (one step per press).
 */
export type EscapeHandler = () => boolean | void;

interface EscapeState {
  stack: EscapeHandler[];
  /** Push a level; returns a disposer that removes exactly this handler. */
  push: (handler: EscapeHandler) => () => void;
  /** Run the topmost applicable level. Returns whether Escape was consumed. */
  handleEscape: () => boolean;
}

export const useEscapeStore = create<EscapeState>((set, get) => ({
  stack: [],

  push: (handler) => {
    set((state) => ({ stack: [...state.stack, handler] }));

    return () =>
      set((state) => ({ stack: state.stack.filter((item) => item !== handler) }));
  },

  handleEscape: () => {
    const { stack } = get();

    for (let index = stack.length - 1; index >= 0; index--) {
      if (stack[index]() !== false) {
        return true;
      }
    }

    return false;
  },
}));
