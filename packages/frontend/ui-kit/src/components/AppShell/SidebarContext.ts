import { createContext, useContext } from 'react';
import { tooltipProps as tooltipAttributes, type TooltipInfo } from '../Tooltip';

export interface SidebarState {
  /** The icon rail is shown: labels hidden, icons only. False in a peek — there the sidebar is full. */
  collapsed: boolean;
  /** Opened over the canvas in a narrow window (⌘\), full width, until Esc or a click outside. */
  peek: boolean;
  /**
   * Tooltip attributes for an item of the rail: its label, to the right of it.
   * Only while collapsed — an expanded sidebar shows the label itself, so it
   * spreads nothing. `<a {...tooltipProps({ text: 'Inbox' })}>`
   */
  tooltipProps(info: TooltipInfo): ReturnType<typeof tooltipAttributes>;
}

const noTooltip = () => ({});

const EXPANDED: SidebarState = { collapsed: false, peek: false, tooltipProps: noTooltip };

const railTooltip = (info: TooltipInfo) => tooltipAttributes({ placement: 'right', ...info });

export const sidebarState = (collapsed: boolean, peek: boolean): SidebarState =>
  collapsed ? { collapsed, peek, tooltipProps: railTooltip } : peek ? { ...EXPANDED, peek } : EXPANDED;

/** Outside the sidebar slot (or outside AppShell) the sidebar reads as expanded. */
export const SidebarContext = createContext<SidebarState>(EXPANDED);

/**
 * For whatever is rendered in AppShell's `sidebar` and `status` slots: how the
 * sidebar is drawn right now, so an item can drop its label on the rail and
 * put it in a tooltip instead. Follows every way the sidebar changes — ⌘\,
 * a drag past the snap, the window's width, peek.
 */
export const useSidebar = () => useContext(SidebarContext);
