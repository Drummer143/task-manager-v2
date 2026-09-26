import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { raw } from '../../tokens';
import { useMessages } from '../../messages';
import { useEscapeStack } from '../../interaction/escape/useEscapeStack';
import { usePresence } from '../../overlay';
import { Resizer } from '../Resizer';
import { panelMaxFor, resolveShell, type ShellLayout, type ShellPrefs } from './resolveShell';
import { STORAGE_KEY, readPrefs, useShellStore } from './shellStore';
import { SidebarContext, sidebarState } from './SidebarContext';
import styles from './AppShell.module.scss';

export interface AppShellProps {
  /** The sidebar: space switcher, sections, the page tree. Its items read `useSidebar()`: rail or full. */
  sidebar: ReactNode;
  /** The status bar at the foot of the sidebar (24 px). */
  status?: ReactNode;
  /** The canvas header: breadcrumbs, view switcher, filters. It does not scroll. */
  header: ReactNode;
  /** The task panel; `null` — closed, and not in the DOM. */
  panel?: ReactNode | null;
  /** The panel's landmark name. Default: the kit's `shellPanel` ('Task'). */
  panelLabel?: string;
  /** `none` — the screen scrolls on its own (a board's columns). */
  canvasScroll?: 'auto' | 'none';
  /**
   * The route's key (pathname + view): the canvas remembers its scroll per key
   * for the session and restores it on return. A change is a navigation — it
   * also closes the peek sidebar.
   */
  scrollKey?: string;
  /** The canvas. */
  children: ReactNode;
  /** Esc closes the panel (spec 07); without it Esc passes the panel by. */
  onPanelClose?(): void;
}

/** Ids the resizers point at; there is one frame per app. */
const SIDEBAR_ID = 'shell-sidebar';
const PANEL_ID = 'shell-panel';
const CANVAS_ID = 'canvas';

/** Canvas scroll per route, for the session only (spec 06: a reload starts at the top). */
const scrollPositions = new Map<string, number>();

/** The frame's geometry lives in CSS variables on .shell: a drag writes them per frame without React. */
const paint = (shell: HTMLElement | null, layout: ShellLayout) => {
  if (!shell) {
    return;
  }

  shell.style.setProperty('--_sidebar', `${layout.sidebarPx}px`);
  shell.style.setProperty('--_panel-col', `${layout.panel === 'docked' ? layout.panelPx : 0}px`);
  shell.style.setProperty('--_panel-px', `${layout.panelPx}px`);
  shell.style.setProperty('--_peek', `${useShellStore.getState().prefs.sidebarWidth}px`);
};

/**
 * The application frame (spec: AppShell): sidebar, canvas header, canvas,
 * task panel and the two borders between them. Geometry only — it knows
 * nothing about routing or data. Its state (widths, collapsed, modes) is in
 * `useShell()`, not in props; the layout comes from `resolveShell` for the
 * frame's own width, measured by one ResizeObserver.
 */
export const AppShell: React.FC<AppShellProps> = ({
  sidebar,
  status,
  header,
  panel = null,
  panelLabel,
  canvasScroll = 'auto',
  scrollKey,
  children,
  onPanelClose,
}) => {
  const messages = useMessages();
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const vw = useShellStore((state) => state.vw);
  const prefs = useShellStore((state) => state.prefs);
  const peek = useShellStore((state) => state.peek);
  const storeLayout = useShellStore((state) => state.layout);
  const storePanelOpen = useShellStore((state) => state.panelOpen);

  const panelOpen = panel != null;
  // The store learns about the panel in an effect; this render already lays it out right.
  const layout = storePanelOpen === panelOpen ? storeLayout : resolveShell(vw, prefs, panelOpen, storeLayout);

  useLayoutEffect(() => {
    useShellStore.getState().setPanelOpen(panelOpen);
  }, [panelOpen]);

  /* ── Measurement and other tabs ── */

  useLayoutEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const measure = (width: number) => {
      // A frame that is not laid out (display: none, a test DOM) keeps the last width.
      if (width > 0) {
        useShellStore.getState().setViewport(Math.round(width));
      }
    };

    measure(shell.getBoundingClientRect().width);

    // A DOM without it (an app's tests) keeps the window's width.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        useShellStore.getState().syncPrefs(readPrefs());
      }
    };

    window.addEventListener('storage', sync);

    return () => window.removeEventListener('storage', sync);
  }, []);

  /* ── Live widths ── */

  /** The preferences a gesture has reached; null outside a gesture. */
  const draft = useRef<ShellPrefs | null>(null);

  // Every render paints the state — or the gesture's draft, if a snap re-rendered mid-drag.
  useLayoutEffect(() => {
    const width = useShellStore.getState().vw;

    paint(shellRef.current, draft.current ? resolveShell(width, draft.current, panelOpen, layout) : layout);
  });

  const live = (patch: Partial<ShellPrefs>) => {
    const { vw: width, prefs: current } = useShellStore.getState();

    draft.current = { ...(draft.current ?? current), ...patch };
    paint(shellRef.current, resolveShell(width, draft.current, panelOpen, layout));
  };

  const snapSidebar = (collapsed: boolean) => {
    live({ sidebarCollapsed: collapsed });
    // The sidebar's own view (full / rail) follows at once, in the same gesture; stored at its end.
    useShellStore.getState().syncPrefs({ ...useShellStore.getState().prefs, sidebarCollapsed: collapsed });
  };

  const commitSidebar = (px: number) => {
    const collapsed = draft.current?.sidebarCollapsed ?? useShellStore.getState().prefs.sidebarCollapsed;

    draft.current = null;
    // Collapsed by the gesture: the width it had stays remembered (spec 03).
    useShellStore.getState().commitPrefs(collapsed ? { sidebarCollapsed: true } : { sidebarCollapsed: false, sidebarWidth: px });
  };

  const commitPanel = (px: number) => {
    draft.current = null;
    useShellStore.getState().commitPrefs({ panelWidth: px });
  };

  /* ── Peek ── */

  const closePeek = useCallback(() => useShellStore.getState().setPeek(false), []);
  /** Where focus was before the peek opened: it goes back there on close. */
  const beforePeek = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (peek) {
      beforePeek.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }

    const aside = sidebarRef.current;
    const active = document.activeElement;

    if (beforePeek.current && (!active || active === document.body || aside?.contains(active))) {
      beforePeek.current.focus({ preventScroll: true });
    }

    beforePeek.current = null;
  }, [peek]);

  useEffect(() => {
    if (!peek) {
      return;
    }

    // Not a modal: no scrim, a click anywhere else just closes it (and still does its own thing).
    const outside = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) {
        closePeek();
      }
    };

    document.addEventListener('pointerdown', outside, true);

    return () => document.removeEventListener('pointerdown', outside, true);
  }, [peek, closePeek]);

  /* ── Esc: peek → overlay panel → docked panel (spec 07); layers stand above ── */

  const escape = useRef<() => boolean>(() => false);
  escape.current = () => {
    if (peek) {
      closePeek();
      return true;
    }

    if (panelOpen && onPanelClose) {
      onPanelClose();
      return true;
    }

    return false;
  };

  useEscapeStack(useCallback(() => escape.current(), []));

  /* ── The panel: focus and the overlay's exit ── */

  /** Focus was in the panel last time it moved: closing the panel brings it to the canvas. */
  const focusInPanel = useRef(false);

  useEffect(() => {
    const track = (event: FocusEvent) => {
      const target = event.target as Element;

      // The panel's border goes with it: focus on it counts as focus in the panel.
      focusInPanel.current = Boolean(panelRef.current?.contains(target) || target.closest?.(`[aria-controls="${PANEL_ID}"]`));
    };

    document.addEventListener('focusin', track);

    return () => document.removeEventListener('focusin', track);
  }, []);

  useLayoutEffect(() => {
    if (panelOpen || !focusInPanel.current) {
      return;
    }

    const active = document.activeElement;

    focusInPanel.current = false;

    if (!active || active === document.body || panelRef.current?.contains(active)) {
      canvasRef.current?.focus({ preventScroll: true });
    }
  }, [panelOpen]);

  /** The last open panel: an overlay fades out with its content still in it. */
  const lastPanel = useRef<{ node: ReactNode; overlay: boolean }>({ node: null, overlay: false });

  if (panelOpen) {
    lastPanel.current = { node: panel, overlay: layout.panel === 'overlay' };
  }

  const panelMounted = usePresence(panelOpen, panelRef);
  // A docked panel closes at once; only an overlay has an exit (spec: animations).
  const showPanel = panelOpen || (panelMounted && lastPanel.current.overlay);
  const panelMode = panelOpen ? layout.panel : 'overlay';

  /* ── Canvas scroll per route ── */

  const scrollTop = useRef(0);

  useLayoutEffect(() => {
    if (scrollKey === undefined) {
      return;
    }

    const canvas = canvasRef.current;

    if (canvas) {
      canvas.scrollTop = scrollPositions.get(scrollKey) ?? 0;
      scrollTop.current = canvas.scrollTop;
    }

    // A navigation closes the peek sidebar.
    closePeek();

    return () => {
      scrollPositions.set(scrollKey, scrollTop.current);
    };
  }, [scrollKey, closePeek]);

  /* ── Render ── */

  const autoCollapsed = layout.sidebar === 'auto-collapsed';
  const sidebarCollapsed = layout.sidebar !== 'expanded';
  const peeking = peek && autoCollapsed;
  // What the sidebar's content draws: the rail, or full (expanded, or a peek over the canvas).
  const sidebarContext = useMemo(() => sidebarState(sidebarCollapsed && !peeking, peeking), [sidebarCollapsed, peeking]);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      data-sidebar={layout.sidebar}
      data-panel={panelOpen ? layout.panel : 'closed'}
    >
      {peeking && <div className={styles.rail} aria-hidden="true" />}

      <aside
        ref={sidebarRef}
        id={SIDEBAR_ID}
        className={styles.sidebar}
        aria-label={messages.shellSidebar}
        data-peek={peeking ? '' : undefined}
        data-collapsed={sidebarContext.collapsed ? '' : undefined}
      >
        <SidebarContext.Provider value={sidebarContext}>
          <div className={styles.sidebarBody}>{sidebar}</div>
          {status != null && <div className={styles.status}>{status}</div>}
        </SidebarContext.Provider>
      </aside>

      {!autoCollapsed && (
        <Resizer
          side="sidebar"
          className={styles.sidebarResizer}
          value={sidebarCollapsed ? raw['sidebar-collapsed'] : layout.sidebarPx}
          min={raw['sidebar-min']}
          max={raw['sidebar-max']}
          defaultValue={raw['sidebar-width']}
          snapBelow={raw['sidebar-snap']}
          collapsed={sidebarCollapsed}
          onLive={(px) => live({ sidebarWidth: px })}
          onCommit={commitSidebar}
          onSnap={snapSidebar}
          controls={SIDEBAR_ID}
          label={messages.resizeSidebar}
        />
      )}

      <div className={styles.main}>
        <header className={styles.header}>{header}</header>
        <main
          ref={canvasRef}
          id={CANVAS_ID}
          tabIndex={-1}
          className={styles.canvas}
          data-scroll={canvasScroll}
          onScroll={(event) => {
            scrollTop.current = event.currentTarget.scrollTop;
          }}
        >
          {children}
        </main>
      </div>

      {panelOpen && (
        <Resizer
          side="panel"
          className={styles.panelResizer}
          value={layout.panelPx}
          min={raw['panel-min']}
          max={panelMaxFor(vw, layout)}
          defaultValue={raw['panel-width']}
          onLive={(px) => live({ panelWidth: px })}
          onCommit={commitPanel}
          controls={PANEL_ID}
          label={messages.resizePanel}
        />
      )}

      {showPanel && (
        <aside
          ref={panelRef}
          id={PANEL_ID}
          className={styles.panel}
          aria-label={panelLabel ?? messages.shellPanel}
          data-mode={panelMode}
          data-state={panelOpen ? 'open' : 'closed'}
        >
          {panelOpen ? panel : lastPanel.current.node}
        </aside>
      )}
    </div>
  );
};

export default AppShell;
