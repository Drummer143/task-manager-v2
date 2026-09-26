import React, { cloneElement, isValidElement } from 'react';
import { mergeProps } from '@zag-js/react';
import { useCloseWhenDetached } from '../../overlay';
import { MenuPanel } from './MenuContent';
import type { MenuItem } from './types';
import { useMenuRoot } from './useMenuRoot';

export interface MenuProps {
  /** The actions, as data — the same array the palette and the selection bar read. */
  items: MenuItem[];
  /** Any kit button: while the menu is open it holds the pressed look (aria-expanded). */
  trigger: React.ReactElement;
  side?: 'bottom' | 'top' | 'right' | 'left';
  align?: 'start' | 'end';
  /** Controlled open state; omit it and the menu keeps its own. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /** The menu's name; by default the trigger names it. */
  'aria-label'?: string;
  className?: string;
}

/**
 * A dropdown menu (spec 09). Behavior — Zag's menu machine: focus, arrows
 * (disabled skipped, round), typeahead, submenus with a pointer corridor,
 * Esc / Tab / click outside. Ours — the look, the item types, async items and
 * item hotkeys while open. Choosing closes it in the same frame as the action.
 */
export const Menu: React.FC<MenuProps> = ({ items, trigger, side = 'bottom', align = 'start', className, ...options }) => {
  const { api, level, close } = useMenuRoot({ ...options, items, placement: `${side}-${align}` });

  useCloseWhenDetached(api.open, () => document.getElementById(api.getTriggerProps().id as string), close);

  const triggerElement = isValidElement<Record<string, unknown>>(trigger)
    ? cloneElement(trigger, mergeProps(trigger.props, api.getTriggerProps()))
    : trigger;

  return (
    <>
      {triggerElement}
      <MenuPanel level={level} items={items} className={className} />
    </>
  );
};
