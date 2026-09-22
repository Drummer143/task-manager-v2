import type { CSSProperties, ReactNode } from 'react';
import { raw } from '../tokens';
import { useMediaQuery } from '../hooks';
import { Resizer } from './Resizer';
import styles from './AppShell.module.css';

const SIDEBAR_COLLAPSE_QUERY = `(max-width: ${raw['breakpoint-sidebar-collapse']}px)`;
const PANEL_OVERLAY_QUERY = `(max-width: ${raw['breakpoint-panel-overlay']}px)`;

export interface AppShellProps {
  /** Sidebar slot: space switcher, page tree, favorites, inbox. */
  sidebar: ReactNode;
  /** Canvas header slot: breadcrumbs, view switcher, filters, actions. Sticky. */
  header: ReactNode;
  /** Canvas — the single content scroll area. */
  children: ReactNode;
  /** Task panel slot. Absent (null/undefined) = closed. Compresses the canvas. */
  panel?: ReactNode;
  /** Status bar slot, pinned to the bottom of the sidebar. */
  status?: ReactNode;
  /** Collapse the sidebar to an icon rail. */
  sidebarCollapsed?: boolean;
  /** Expanded sidebar width in px. Owned by the product (e.g. persisted). */
  sidebarWidth?: number;
  /** Called while dragging the sidebar edge. Its presence enables the handle. */
  onSidebarWidthChange?: (width: number) => void;
  /** Task panel width in px. */
  panelWidth?: number;
  /** Called while dragging the panel edge. Its presence enables the handle. */
  onPanelWidthChange?: (width: number) => void;
}

/**
 * AppShell lays out the four regions (sidebar / canvas header / canvas / task
 * panel) plus the status bar. It is pure geometry: controlled widths in, slots
 * out. It knows nothing about routing, data or focus — those plug in later.
 */
export function AppShell({
  sidebar,
  header,
  children,
  panel = null,
  status,
  sidebarCollapsed = false,
  sidebarWidth = raw['sidebar-width'],
  onSidebarWidthChange,
  panelWidth = raw['panel-width'],
  onPanelWidthChange,
}: AppShellProps) {
  // Responsive rules (spec 07): below 1100px the sidebar is forced to the icon
  // rail; below 900px the panel overlays the canvas instead of compressing it.
  // These override, but never mutate, the controlled props.
  const forceCollapsed = useMediaQuery(SIDEBAR_COLLAPSE_QUERY);
  const panelOverlay = useMediaQuery(PANEL_OVERLAY_QUERY);

  const collapsed = sidebarCollapsed || forceCollapsed;
  const isOverlay = panel != null && panelOverlay;

  const sidebarStyle: CSSProperties | undefined = collapsed ? undefined : { width: sidebarWidth };

  return (
    <div className={styles.shell}>
      <aside
        className={collapsed ? `${styles.sidebar} ${styles.sidebarCollapsed}` : styles.sidebar}
        style={sidebarStyle}
      >
        <div className={styles.sidebarNav}>{sidebar}</div>
        {status == null ? null : <div className={styles.status}>{status}</div>}
      </aside>

      {!collapsed && onSidebarWidthChange != null && (
        <Resizer
          value={sidebarWidth}
          min={raw['sidebar-width-min']}
          max={raw['sidebar-width-max']}
          onChange={onSidebarWidthChange}
          aria-label="Resize sidebar"
        />
      )}

      <div className={styles.main}>
        <header className={styles.header}>{header}</header>
        <div className={styles.canvas}>{children}</div>
      </div>

      {!isOverlay && panel != null && onPanelWidthChange != null && (
        <Resizer
          value={panelWidth}
          min={raw['panel-width-min']}
          max={raw['panel-width-max']}
          onChange={onPanelWidthChange}
          invert
          aria-label="Resize panel"
        />
      )}

      {panel == null ? null : (
        <aside
          className={isOverlay ? `${styles.panel} ${styles.panelOverlay}` : styles.panel}
          style={{ width: panelWidth }}
        >
          {panel}
        </aside>
      )}
    </div>
  );
}

export default AppShell;
