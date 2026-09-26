import { raw } from '../../tokens';

/** The user's choice — persisted, never overwritten by the layout (spec: AppShell · 05). */
export interface ShellPrefs {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  panelWidth: number;
}

export type SidebarMode = 'expanded' | 'collapsed' | 'auto-collapsed';
export type PanelMode = 'closed' | 'docked' | 'overlay';

/** What the frame actually shows for a window width. */
export interface ShellLayout {
  sidebar: SidebarMode;
  sidebarPx: number;
  panel: PanelMode;
  panelPx: number;
  canvasPx: number;
}

/*
 * Window thresholds are JS constants, not CSS variables: a variable does not
 * work in a media query, and the decision is JS's anyway (spec 05).
 */
/** Below this the sidebar collapses by itself; ⌘\ then opens it over the canvas (peek). */
export const BP_SIDEBAR = 1100;
/** Below this the panel never docks: it goes over the canvas. */
export const BP_PANEL = 900;
/** Either threshold switches back only this far past it: a trembling window does not flip the layout per pixel. */
export const HYSTERESIS = 16;
/** An overlay panel leaves this much of the canvas visible on its left. */
export const OVERLAY_GUTTER = 24;

export const DEFAULT_PREFS: ShellPrefs = {
  sidebarWidth: raw['sidebar-width'],
  sidebarCollapsed: false,
  panelWidth: raw['panel-width'],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Out-of-range or broken values are pulled into the limits. */
export const clampPrefs = (prefs: Partial<ShellPrefs>): ShellPrefs => ({
  sidebarWidth: Number.isFinite(prefs.sidebarWidth)
    ? clamp(prefs.sidebarWidth as number, raw['sidebar-min'], raw['sidebar-max'])
    : DEFAULT_PREFS.sidebarWidth,
  sidebarCollapsed: typeof prefs.sidebarCollapsed === 'boolean' ? prefs.sidebarCollapsed : DEFAULT_PREFS.sidebarCollapsed,
  panelWidth: Number.isFinite(prefs.panelWidth)
    ? clamp(prefs.panelWidth as number, raw['panel-min'], raw['panel-max'])
    : DEFAULT_PREFS.panelWidth,
});

/**
 * The frame's widths and modes for a window width (spec: AppShell · 05). Pure:
 * the preferences go in and are never changed — narrow the window and widen it
 * back, and everything is as it was. `previous` gives the thresholds their
 * hysteresis. The order of who gives way is fixed: first the panel shrinks to
 * its minimum, then it goes over the canvas; the frame never collapses the
 * sidebar in a wide window — that is the user's choice.
 */
export const resolveShell = (
  vw: number,
  prefs: ShellPrefs,
  panelOpen: boolean,
  previous?: ShellLayout,
): ShellLayout => {
  // 1. The sidebar.
  const sidebarThreshold = previous?.sidebar === 'auto-collapsed' ? BP_SIDEBAR + HYSTERESIS : BP_SIDEBAR;
  const sidebar: SidebarMode = vw < sidebarThreshold ? 'auto-collapsed' : prefs.sidebarCollapsed ? 'collapsed' : 'expanded';
  const sidebarPx = sidebar === 'expanded' ? prefs.sidebarWidth : raw['sidebar-collapsed'];

  if (!panelOpen) {
    return { sidebar, sidebarPx, panel: 'closed', panelPx: 0, canvasPx: vw - sidebarPx };
  }

  // 2. The panel docks — squeezing the canvas — while the canvas keeps its minimum.
  const panelThreshold = previous?.panel === 'overlay' ? BP_PANEL + HYSTERESIS : BP_PANEL;
  const room = vw - sidebarPx - raw['canvas-min'];

  if (vw >= panelThreshold && room >= raw['panel-min']) {
    // Only the actual width shrinks to the room; the preference stays.
    const panelPx = Math.min(prefs.panelWidth, room);

    return { sidebar, sidebarPx, panel: 'docked', panelPx, canvasPx: vw - sidebarPx - panelPx };
  }

  // 3. Otherwise over the canvas: the canvas keeps its width and stays workable.
  const panelPx = Math.max(0, Math.min(prefs.panelWidth, vw - sidebarPx - OVERLAY_GUTTER));

  return { sidebar, sidebarPx, panel: 'overlay', panelPx, canvasPx: vw - sidebarPx };
};

/** How wide a docked panel may be dragged in this window: up to its max, as long as the canvas keeps its minimum. */
export const panelMaxFor = (vw: number, layout: ShellLayout) =>
  layout.panel === 'overlay'
    ? Math.max(raw['panel-min'], Math.min(raw['panel-max'], vw - layout.sidebarPx - OVERLAY_GUTTER))
    : Math.max(raw['panel-min'], Math.min(raw['panel-max'], vw - layout.sidebarPx - raw['canvas-min']));
