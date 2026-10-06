import React, { useRef } from 'react';
import {
  ContextMenu,
  LinkBase,
  tooltipProps,
  useShell,
  type ContextMenuHandle,
  type MenuItem,
} from '@task-manager-v2/ui-kit';
import { MoreHorizontalIcon } from '@task-manager-v2/ui-kit/icons';
import styles from './NavItem.module.scss';

export interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  /** The page the user is on: `aria-current="page"`. */
  current?: boolean;
  /** Unread: > 0 — the number at the right, > 99 — "99+", on the rail — a dot on the icon. 0 is not shown. */
  count?: number;
  /** "Something new here", without a number; ignored when `count` > 0. */
  dot?: boolean;
  /** The hotkey shown in the rail's tooltip ('g i'). */
  keys?: string;
  /** The row's ⋯ and its right click / Shift+F10. */
  menu?: MenuItem[];
}

const MAX_COUNT = 99;

const countText = (count: number) => (count > MAX_COUNT ? `${MAX_COUNT}+` : String(count));

/**
 * One row of the sidebar (spec: Sidebar · 03): Inbox, a favorite. The whole row
 * is the link; the ⋯ lies over its right end, so a click anywhere but on the
 * button opens the page. On the rail (Sidebar · 05) only the icon is left, the
 * name and the count go to a tooltip.
 */
export const NavItem: React.FC<NavItemProps> = ({ href, icon, label, current, count = 0, dot, keys, menu }) => {
  const { sidebarView } = useShell();
  const rail = sidebarView === 'collapsed';
  const linkRef = useRef<HTMLAnchorElement>(null);
  const menuRef = useRef<ContextMenuHandle>(null);

  const unread = count > 0;
  const marked = unread || dot === true;
  // What a reader hears instead of the bare label: the number is not read out of context
  const name = unread ? `${label}, ${count} unread` : dot ? `${label}, updated` : undefined;

  if (rail) {
    return (
      <LinkBase
        href={href}
        className={styles.railButton}
        aria-current={current ? 'page' : undefined}
        aria-label={name ?? label}
        data-current={current ? '' : undefined}
        {...tooltipProps({
          text: unread ? `${label} · ${countText(count)} unread` : label,
          keys,
          placement: 'right',
        })}
      >
        <span className={styles.icon}>{icon}</span>
        {marked && <span className={styles.railDot} aria-hidden="true" />}
      </LinkBase>
    );
  }

  const link = (
    <LinkBase
      ref={linkRef}
      href={href}
      className={styles.link}
      aria-current={current ? 'page' : undefined}
      aria-label={name}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label} {...tooltipProps({ overflow: true })}>
        {label}
      </span>
      {unread ? (
        <span className={styles.count} aria-hidden="true">
          {countText(count)}
        </span>
      ) : (
        dot && <span className={styles.dot} aria-hidden="true" />
      )}
    </LinkBase>
  );

  return (
    <div className={styles.row} data-current={current ? '' : undefined} data-menu={menu ? '' : undefined}>
      {menu ? (
        <>
          <ContextMenu ref={menuRef} items={menu} aria-label={label}>
            {link}
          </ContextMenu>
          {/* Not a Tab stop: from the keyboard the menu is Shift+F10 on the row (spec 09) */}
          <button
            type="button"
            className={styles.more}
            tabIndex={-1}
            aria-label="More"
            {...tooltipProps({ text: 'More' })}
            onClick={(event) => {
              const anchor = event.currentTarget;
              menuRef.current?.openAt(anchor, linkRef.current ?? undefined);
            }}
          >
            <MoreHorizontalIcon />
          </button>
        </>
      ) : (
        link
      )}
    </div>
  );
};

export default NavItem;
