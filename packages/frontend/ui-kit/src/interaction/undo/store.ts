import { create } from 'zustand';

/**
 * One reversible operation (philosophy 04: undo instead of "are you sure").
 * Opaque to the kit: a name for people and the functions that reverse and
 * repeat it. The data layer decides what they do — optimistic mutations push
 * here, the undo toast is only a button to the same entry.
 */
export interface UndoOperation {
  /** What is undone, for people: "Move 3 tasks to Done". */
  label: string;
  /** Reverses the operation. A rejection means it was not reversed: the entry stays. */
  undo(): void | Promise<void>;
  /** Repeats it after an undo; without it an undone operation cannot be redone. */
  redo?(): void | Promise<void>;
}

export interface UndoEntry extends UndoOperation {
  id: string;
}

/** Older operations fall off the end: nobody undoes a hundred steps back. */
export const UNDO_HISTORY_LIMIT = 100;

interface UndoState {
  /** Done operations, oldest first: the last is what mod+Z undoes. */
  past: UndoEntry[];
  /** Undone ones that can be redone, the next redo last. */
  future: UndoEntry[];
}

export const useUndoStore = create<UndoState>(() => ({ past: [], future: [] }));

let sequence = 0;

const without = (list: UndoEntry[], id: string) => list.filter((entry) => entry.id !== id);

/**
 * The app's history of operations — one per app, like the Esc ladder.
 * mod+Z / mod+Shift+Z drive it (KitRoot listens); the undo toast undoes its
 * own entry by id, and after the toast is gone the entry is still here.
 */
export const undoHistory = {
  /** Records a done operation and returns its id. A new operation clears what could be redone. */
  push(operation: UndoOperation): string {
    const id = `op-${++sequence}`;

    useUndoStore.setState(({ past }) => ({
      past: [...past, { ...operation, id }].slice(-UNDO_HISTORY_LIMIT),
      future: [],
    }));

    return id;
  },

  has: (id: string) => useUndoStore.getState().past.some((entry) => entry.id === id),

  /**
   * Undoes the last operation, or the one with `id` (the toast's). Resolves to
   * the entry undone, or null when there was none; rejects — and puts the
   * entry back on top, to be tried again — when its `undo` fails.
   */
  async undo(id?: string): Promise<UndoEntry | null> {
    const { past } = useUndoStore.getState();
    const entry = id === undefined ? past[past.length - 1] : past.find((item) => item.id === id);

    if (!entry) {
      return null;
    }

    // Out of the history before it runs: a second mod+Z in the meantime takes the next one.
    useUndoStore.setState((state) => ({ past: without(state.past, entry.id) }));

    try {
      await entry.undo();
    } catch (error) {
      useUndoStore.setState((state) => ({ past: [...state.past, entry] }));
      throw error;
    }

    if (entry.redo) {
      useUndoStore.setState((state) => ({ future: [...state.future, entry] }));
    }

    return entry;
  },

  /** Repeats the last undone operation. The same contract as `undo`. */
  async redo(): Promise<UndoEntry | null> {
    const { future } = useUndoStore.getState();
    const entry = future[future.length - 1];

    if (!entry?.redo) {
      return null;
    }

    useUndoStore.setState((state) => ({ future: without(state.future, entry.id) }));

    try {
      await entry.redo();
    } catch (error) {
      useUndoStore.setState((state) => ({ future: [...state.future, entry] }));
      throw error;
    }

    useUndoStore.setState((state) => ({ past: [...state.past, entry] }));

    return entry;
  },

  /** Forgets an operation that can no longer be undone (the server rejected it, its object is gone). */
  remove(id: string) {
    useUndoStore.setState((state) => ({ past: without(state.past, id), future: without(state.future, id) }));
  },

  /** Forgets everything — switching workspaces, signing out. */
  clear() {
    useUndoStore.setState({ past: [], future: [] });
  },
};
