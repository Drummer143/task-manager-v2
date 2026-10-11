import { create } from 'zustand';

interface RemoteFlashState {
  /** By notification id: a key that changes with every arrival, so the row's tint restarts. */
  keys: Record<string, number>;
  flash(ids: readonly string[]): void;
}

let next = 0;

/**
 * Rows that came from elsewhere (another tab, another person): tinted for --highlight-remote
 * (spec: Inbox · 10). The fade is CSS; a new key remounts the tint and starts it again.
 */
export const useRemoteFlashStore = create<RemoteFlashState>((set) => ({
  keys: {},
  flash: (ids) =>
    set((state) => ({
      keys: {
        ...state.keys,
        ...Object.fromEntries(ids.map((id) => [id, ++next])),
      },
    })),
}));
