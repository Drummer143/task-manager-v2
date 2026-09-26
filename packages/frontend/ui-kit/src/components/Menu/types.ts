import type { ReactNode } from 'react';

/**
 * An action is described once, as data (spec 09): the menu, the context menu,
 * the selection bar and the command palette are different ways to show the
 * same `MenuItem[]`.
 */
export interface MenuActionItem {
  type: 'action';
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shown at the right; while the menu is open, pressing it runs the item. */
  keys?: string;
  /** A second, muted line. */
  description?: string;
  /** Destructive: last, after a separator (spec 09). */
  danger?: boolean;
  /** Unavailable, and why: dimmed, skipped by the arrows, the reason in a tooltip. */
  disabledReason?: string;
  /** A link: opens through the router adapter like any kit link. */
  href?: string;
  /**
   * Runs in the same frame as the choice. A Promise makes the item wait in the
   * open menu: busy, a spinner after 200 ms, the error on the spot.
   */
  onSelect?(): void | Promise<void>;
}

export interface MenuCheckboxItem {
  type: 'checkbox';
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  keys?: string;
  disabledReason?: string;
}

/** One of: closes the menu on choice. */
export interface MenuRadioOption {
  value: string;
  label: string;
  /** A sign of its own (a status dot, an avatar): the choice then moves to a check at the right. */
  icon?: ReactNode;
  disabledReason?: string;
}

export interface MenuRadioGroupItem {
  type: 'radio-group';
  id: string;
  /** Shown as the group's label ("Sort", "Status"). */
  label?: string;
  value: string | null;
  onValueChange(value: string): void;
  options: MenuRadioOption[];
}

export interface MenuSubmenuItem {
  type: 'submenu';
  id: string;
  label: string;
  icon?: ReactNode;
  disabledReason?: string;
  /** One level only (spec 09): a submenu inside a submenu is ignored. */
  items: MenuItem[];
}

export interface MenuSeparatorItem {
  type: 'separator';
}

export interface MenuLabelItem {
  type: 'label';
  label: string;
}

export type MenuItem =
  | MenuActionItem
  | MenuCheckboxItem
  | MenuRadioGroupItem
  | MenuSubmenuItem
  | MenuSeparatorItem
  | MenuLabelItem;
