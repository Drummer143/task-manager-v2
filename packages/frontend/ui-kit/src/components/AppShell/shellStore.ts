import { create } from 'zustand';
import { DEFAULT_PREFS, clampPrefs, resolveShell, type ShellLayout, type ShellPrefs } from './resolveShell';

/** One key for the browser, not per workspace: the layout is the workplace's, not the content's (spec 08). */
export const STORAGE_KEY = 'verso:shell';
const VERSION = 1;

/** Storage may be missing or throw (private mode, blocked site data): the frame then just uses the defaults. */
export const readPrefs = (): ShellPrefs => {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null') as
      | (Partial<ShellPrefs> & { v?: number })
      | null;

    // An unknown version is not guessed at: defaults.
    return stored && stored.v === VERSION ? clampPrefs(stored) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
};

const writePrefs = (prefs: ShellPrefs) => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...prefs }));
  } catch {
    // Not saved this time; the frame works on.
  }
};

const initialWidth = () => (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280);

interface ShellState {
  prefs: ShellPrefs;
  /** The frame's own width — what the thresholds compare against (a ResizeObserver on .shell). */
  vw: number;
  panelOpen: boolean;
  /** The auto-collapsed sidebar opened over the canvas with ⌘\. Fleeting: not stored. */
  peek: boolean;
  layout: ShellLayout;

  setViewport(vw: number): void;
  setPanelOpen(open: boolean): void;
  /** A finished gesture: the new preference is applied and remembered. */
  commitPrefs(patch: Partial<ShellPrefs>): void;
  /** Another tab changed the preferences: take them, do not write them back. */
  syncPrefs(prefs: ShellPrefs): void;
  setPeek(peek: boolean): void;
}

const relayout = (state: Pick<ShellState, 'vw' | 'prefs' | 'panelOpen' | 'layout'>) =>
  resolveShell(state.vw, state.prefs, state.panelOpen, state.layout);

/**
 * The frame's state. Read synchronously on import — before the first render —
 * so the frame never jumps after load (spec 08).
 */
export const useShellStore = create<ShellState>((set, get) => {
  const prefs = readPrefs();
  const vw = initialWidth();

  return {
    prefs,
    vw,
    panelOpen: false,
    peek: false,
    layout: resolveShell(vw, prefs, false),

    setViewport: (next) => {
      if (next === get().vw) {
        return;
      }

      set((state) => {
        const layout = relayout({ ...state, vw: next });

        // A window that widens past the threshold ends a peek: the sidebar is in its column again.
        return { vw: next, layout, peek: layout.sidebar === 'auto-collapsed' && state.peek };
      });
    },
    setPanelOpen: (open) => {
      if (open === get().panelOpen) {
        return;
      }

      set((state) => ({ panelOpen: open, layout: relayout({ ...state, panelOpen: open }) }));
    },
    commitPrefs: (patch) => {
      const next = clampPrefs({ ...get().prefs, ...patch });

      set((state) => ({ prefs: next, layout: relayout({ ...state, prefs: next }) }));
      writePrefs(next);
    },
    syncPrefs: (next) => set((state) => ({ prefs: next, layout: relayout({ ...state, prefs: next }) })),
    setPeek: (peek) => set({ peek }),
  };
});

/**
 * The frame's state and actions, for the app and the sidebar (spec: AppShell ·
 * 10). The frame's state lives here, not in AppShell's props.
 */
export const useShell = () => {
  const layout = useShellStore((state) => state.layout);
  const prefs = useShellStore((state) => state.prefs);
  const peek = useShellStore((state) => state.peek);

  return {
    layout,
    prefs,
    peek,
    /** What the sidebar should draw: full (expanded or peek) or the icon rail. */
    sidebarView: layout.sidebar === 'expanded' || peek ? ('expanded' as const) : ('collapsed' as const),
    toggleSidebar,
    closePeek: () => useShellStore.getState().setPeek(false),
    setSidebarWidth: (px: number) => useShellStore.getState().commitPrefs({ sidebarWidth: px }),
    setPanelWidth: (px: number) => useShellStore.getState().commitPrefs({ panelWidth: px }),
    resetWidths: () =>
      useShellStore.getState().commitPrefs({ sidebarWidth: DEFAULT_PREFS.sidebarWidth, panelWidth: DEFAULT_PREFS.panelWidth }),
  };
};

/**
 * ⌘\ (the app binds it through its hotkeys): collapse / expand the sidebar;
 * in a narrow window, where it is collapsed by itself, open it over the canvas
 * (peek) — without touching the user's choice (spec 02, E).
 */
export const toggleSidebar = () => {
  const { layout, peek, prefs, setPeek, commitPrefs } = useShellStore.getState();

  if (layout.sidebar === 'auto-collapsed') {
    setPeek(!peek);
  } else {
    commitPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
  }
};
