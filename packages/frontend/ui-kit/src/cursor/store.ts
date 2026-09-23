import { create } from 'zustand';

/**
 * The canvas cursor (spec 05): the current task as application state, not DOM
 * focus. Hotkeys act on it; it survives the task panel opening and closing. The
 * id is opaque to the kit — the product decides what it means.
 */
export interface CursorState {
  cursor: string | null;
  setCursor: (id: string | null) => void;
  clearCursor: () => void;
}

export const useCursorStore = create<CursorState>((set) => ({
  cursor: null,
  setCursor: (id) => set({ cursor: id }),
  clearCursor: () => set({ cursor: null }),
}));

/** Convenience hook: `{ cursor, setCursor, clearCursor }`, reactive to changes. */
export const useCursor = () => useCursorStore();
