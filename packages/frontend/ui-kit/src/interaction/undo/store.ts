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
  /** Reverses the operation. A rejection means it was not reversed: an error toast offers Retry. */
  undo(): void | Promise<void>;
  /** Repeats it after an undo; without it an undone operation cannot be redone. */
  redo?(): void | Promise<void>;
  /**
   * Where its result is seen: mod+Z reaches it only there. A page's id for what
   * is done on a board or in a document; `UNDO_GLOBAL_SCOPE` for what is seen
   * everywhere (the page tree, workspace settings). Default: the scope the
   * app is in when the operation is recorded (`undoHistory.setScope`).
   */
  scope?: string;
}

export interface UndoEntry extends UndoOperation {
  id: string;
  scope: string;
}

/** Operations seen on every page: mod+Z reaches them from anywhere. */
export const UNDO_GLOBAL_SCOPE = 'global';

/** Older operations fall off the end: nobody undoes a hundred steps back. */
export const UNDO_HISTORY_LIMIT = 100;

interface UndoState {
  /** Done operations, oldest first: the last is what mod+Z undoes. */
  past: UndoEntry[];
  /** Undone ones that can be redone, the next redo last. */
  future: UndoEntry[];
  /** Where the app is now (the open page); null — no scopes, everything is in reach. */
  scope: string | null;
}

export const useUndoStore = create<UndoState>(() => ({ past: [], future: [], scope: null }));

let sequence = 0;

const without = (list: UndoEntry[], id: string) => list.filter((entry) => entry.id !== id);

/** What mod+Z may touch from where the app is: the page's own operations and the global ones. */
const inReach = (entry: UndoEntry, scope: string | null) =>
  scope === null || entry.scope === UNDO_GLOBAL_SCOPE || entry.scope === scope;

const lastInReach = (list: UndoEntry[], scope: string | null) => {
  for (let index = list.length - 1; index >= 0; index--) {
    if (inReach(list[index], scope)) {
      return list[index];
    }
  }

  return undefined;
};

/**
 * The app's history of operations — one per app, like the Esc ladder.
 * mod+Z / mod+Shift+Z drive it (KitRoot listens); the undo toast undoes its
 * own entry by id, and after the toast is gone the entry is still here.
 *
 * Scoped: mod+Z undoes only what can be seen where the app is — leaving a
 * board neither loses its operations nor lets mod+Z change it unseen; back
 * on the board they are in reach again. Navigation is never undone.
 */
export const undoHistory = {
  /** Records a done operation and returns its id. A new operation clears what could be redone. */
  push(operation: UndoOperation): string {
    const id = `op-${++sequence}`;

    useUndoStore.setState(({ past, future, scope }) => {
      const entry: UndoEntry = { ...operation, id, scope: operation.scope ?? scope ?? UNDO_GLOBAL_SCOPE };

      return {
        past: [...past, entry].slice(-UNDO_HISTORY_LIMIT),
        // A new operation clears what could be redone in its own scope; other pages keep theirs.
        future: future.filter((item) => item.scope !== entry.scope),
      };
    });

    return id;
  },

  /** The app moved (a route change): from now on mod+Z reaches this scope's operations and the global ones. */
  setScope(scope: string | null) {
    useUndoStore.setState({ scope });
  },

  /** What mod+Z (`'undo'`) or mod+Shift+Z (`'redo'`) would take now, if anything. */
  next(step: 'undo' | 'redo'): UndoEntry | undefined {
    const { past, future, scope } = useUndoStore.getState();

    return step === 'undo' ? lastInReach(past, scope) : lastInReach(future.filter((entry) => entry.redo), scope);
  },

  has: (id: string) => useUndoStore.getState().past.some((entry) => entry.id === id),

  /**
   * Undoes the last operation in reach, or the one with `id` — the toast's,
   * wherever it was done: the toast says what it undoes. Resolves to
   * the entry undone, or null when there was none. Rejects when its `undo`
   * fails — and the entry is out of the history then: a failed operation
   * never blocks the ones before it, the next mod+Z takes the previous one.
   * `retry(entry, 'undo')` tries the failed one again.
   */
  async undo(id?: string): Promise<UndoEntry | null> {
    const entry = id === undefined ? undoHistory.next('undo') : useUndoStore.getState().past.find((item) => item.id === id);

    if (!entry) {
      return null;
    }

    // Out of the history before it runs: a second mod+Z in the meantime takes the next one.
    useUndoStore.setState((state) => ({ past: without(state.past, entry.id) }));

    return undoHistory.retry(entry, 'undo');
  },

  /** Repeats the last undone operation in reach. The same contract as `undo`: a failed redo leaves the redo stack. */
  async redo(): Promise<UndoEntry | null> {
    const entry = undoHistory.next('redo');

    if (!entry) {
      return null;
    }

    useUndoStore.setState((state) => ({ future: without(state.future, entry.id) }));

    return undoHistory.retry(entry, 'redo');
  },

  /**
   * Runs a step of an entry that is out of the history — a failed undo or
   * redo being tried again. Done, the entry goes where the step leads: after
   * an undo — to what can be redone (if it can), after a redo — back to the past.
   */
  async retry(entry: UndoEntry, step: 'undo' | 'redo'): Promise<UndoEntry> {
    if (step === 'undo') {
      await entry.undo();

      if (entry.redo) {
        useUndoStore.setState((state) => ({ future: [...without(state.future, entry.id), entry] }));
      }
    } else {
      await entry.redo?.();
      useUndoStore.setState((state) => ({ past: [...without(state.past, entry.id), entry] }));
    }

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
