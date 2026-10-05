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
  /**
   * The collapsed sidebar opened over the canvas: ⌘\ in a narrow frame, or a
   * rail button (Favorites, Pages) at any width. Fleeting: not stored, and the
   * user's choice (collapsed) stays as it was.
   */
  peek: boolean;
  /** The id of what the peek opened for (a section): the frame scrolls it into view. */
  peekTarget: string | null;
  layout: ShellLayout;

  setViewport(vw: number): void;
  setPanelOpen(open: boolean): void;
  /** A finished gesture: the new preference is applied and remembered. */
  commitPrefs(patch: Partial<ShellPrefs>): void;
  /** Another tab changed the preferences: take them, do not write them back. */
  syncPrefs(prefs: ShellPrefs): void;
  setPeek(peek: boolean): void;
  /** Opens a collapsed sidebar over the canvas, scrolled to `target` (an element id inside it). */
  openPeek(target?: string): void;
}

/** A peek lives only over a collapsed sidebar; a layout that expands it ends the peek. */
const peekFor = (layout: ShellLayout, state: Pick<ShellState, 'peek' | 'peekTarget'>) =>
  layout.sidebar === 'expanded' ? { peek: false, peekTarget: null } : { peek: state.peek, peekTarget: state.peekTarget };

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
    peekTarget: null,
    layout: resolveShell(vw, prefs, false),

    setViewport: (next) => {
      if (next === get().vw) {
        return;
      }

      set((state) => {
        const layout = relayout({ ...state, vw: next });

        // A window that widens past the threshold ends a peek: the sidebar is in its column again.
        return { vw: next, layout, ...peekFor(layout, state) };
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

      set((state) => {
        const layout = relayout({ ...state, prefs: next });

        // Expanded by the user: the peek has nothing left to show.
        return { prefs: next, layout, ...peekFor(layout, state) };
      });
      writePrefs(next);
    },
    syncPrefs: (next) =>
      set((state) => {
        const layout = relayout({ ...state, prefs: next });

        return { prefs: next, layout, ...peekFor(layout, state) };
      }),
    setPeek: (peek) => set(peek ? { peek: get().layout.sidebar !== 'expanded' } : { peek: false, peekTarget: null }),
    openPeek: (target) => {
      // An expanded sidebar is already on screen: nothing to open over the canvas.
      if (get().layout.sidebar !== 'expanded') {
        set({ peek: true, peekTarget: target ?? null });
      }
    },
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
    /** A rail button: open the sidebar over the canvas at a section (its element id), at any width. */
    openPeek: (target?: string) => useShellStore.getState().openPeek(target),
    setSidebarWidth: (px: number) => useShellStore.getState().commitPrefs({ sidebarWidth: px }),
    setPanelWidth: (px: number) => useShellStore.getState().commitPrefs({ panelWidth: px }),
    resetWidths: () =>
      useShellStore.getState().commitPrefs({ sidebarWidth: DEFAULT_PREFS.sidebarWidth, panelWidth: DEFAULT_PREFS.panelWidth }),
  };
};

/**
 * ⌘\ (the app binds it through its hotkeys): collapse / expand the sidebar;
 * in a narrow window, where it is collapsed by itself, open it over the canvas
 * (peek) — without touching the user's choice (spec 02, E). A peek opened from
 * the rail in a wide window ends by expanding: the user asked for the sidebar.
 */
export const toggleSidebar = () => {
  const { layout, peek, prefs, setPeek, commitPrefs } = useShellStore.getState();

  if (layout.sidebar === 'auto-collapsed') {
    setPeek(!peek);
  } else {
    commitPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
  }
};

/** A rail button (Favorites, Pages): the sidebar over the canvas at that section (spec: Sidebar · 05). */
export const openPeek = (target?: string) => useShellStore.getState().openPeek(target);
