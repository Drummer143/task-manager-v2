import { create } from 'zustand';
import { HotkeyConfig, HotkeyCallback } from './types';
import { HOTKEY_KEY_SEPARATOR } from './constants';

interface HotkeysState {
  hotkeys: Record<string, HotkeyConfig[]>;

  /**
   * The armed chord prefix (e.g. `g`), or null when no chord is pending.
   * Reactive — subscribe to show it in the UI while waiting for the next step.
   */
  activeChord: string | null;

  registerHotkey: (key: string | string[], config: HotkeyConfig) => () => void;

  unregisterHotkey: (key: string | string[], config?: HotkeyConfig) => void;

  getHotkeyHandler: (key: string | string[]) => HotkeyCallback | undefined;

  setActiveChord: (chord: string | null) => void;
}

const normalizeHotkey = (key: string | string[]) => {
  if (!Array.isArray(key)) {
    return key;
  }

  return [...key].sort().join(HOTKEY_KEY_SEPARATOR);
};

export const useHotkeysStore = create<HotkeysState>((set, get) => ({
  hotkeys: {},

  activeChord: null,

  registerHotkey: (key, config) => {
    const hotkey = normalizeHotkey(key);

    set((state) => ({
      hotkeys: {
        ...state.hotkeys,

        [hotkey]: [...(state.hotkeys[hotkey] ?? []), config],
      },
    }));

    return () => get().unregisterHotkey(key, config);
  },

  unregisterHotkey: (key, config) => {
    const hotkey = normalizeHotkey(key);

    set((state) => {
      const registrations = state.hotkeys[hotkey];

      if (!registrations) {
        return state;
      }

      if (!config) {
        const hotkeys = { ...state.hotkeys };
        delete hotkeys[hotkey];

        return { hotkeys };
      }

      const nextRegistrations = registrations.filter((item) => item !== config);

      const hotkeys = { ...state.hotkeys };

      if (nextRegistrations.length === 0) {
        delete hotkeys[hotkey];
      } else {
        hotkeys[hotkey] = nextRegistrations;
      }

      return { hotkeys };
    });
  },

  getHotkeyHandler: (key) => {
    const hotkey = normalizeHotkey(key);
    const registrations = get().hotkeys[hotkey];

    if (!registrations || registrations.length === 0) {
      return undefined;
    }

    return registrations.at(-1)?.callback;
  },

  setActiveChord: (chord) => set({ activeChord: chord }),
}));
