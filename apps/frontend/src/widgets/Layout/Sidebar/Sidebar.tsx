import React, { useLayoutEffect, useRef } from 'react';
import { IconButton, toggleSidebar, useShell } from '@task-manager-v2/ui-kit';
import { InboxIcon, SidebarCollapseIcon, SidebarExpandIcon } from '@task-manager-v2/ui-kit/icons';
import { NavItem } from '../../../shared/ui/NavItem';
import { SIDEBAR_TOGGLE_KEYS, INBOX_KEYS } from './hotkeys';
import styles from './Sidebar.module.scss';

export interface SidebarInboxProps {
  href: string;

  unread?: number;
  current?: boolean;
}

export interface SidebarProps {
  inbox: SidebarInboxProps;
}

export const Sidebar: React.FC<SidebarProps> = ({ inbox }) => {
  const { sidebarView } = useShell();
  const rail = sidebarView === 'collapsed';

  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  const lastFocus = useRef<{ inside: boolean; href: string | null }>({ inside: false, href: null });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const { inside, href } = lastFocus.current;

    if (!root || !inside || root.contains(document.activeElement)) {
      return;
    }

    const again = href
      ? [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].find((link) => link.getAttribute('href') === href)
      : undefined;

    (again ?? toggleRef.current)?.focus({ preventScroll: true });
  }, [rail]);

  const inboxItem = (
    <NavItem
      href={inbox.href}
      icon={<InboxIcon />}
      label="Inbox"
      count={inbox.unread}
      current={inbox.current}
      keys={INBOX_KEYS}
    />
  );

  return (
    <div
      ref={rootRef}
      className={styles.sidebar}
      data-rail={rail ? '' : undefined}
      onFocus={(event) => {
        lastFocus.current = { inside: true, href: event.target.getAttribute('href') };
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) {
          lastFocus.current = { inside: false, href: null };
        }
      }}
    >
      <div className={styles.header}>
        {!rail && (
          <IconButton
            ref={toggleRef}
            className={styles.toggle}
            icon={<SidebarCollapseIcon />}
            label="Collapse sidebar"
            keys={SIDEBAR_TOGGLE_KEYS}
            onClick={toggleSidebar}
          />
        )}
      </div>

      <nav className={styles.body}>
        {inboxItem}

        {rail && (
          <IconButton
            ref={toggleRef}
            className={styles.expand}
            icon={<SidebarExpandIcon />}
            label="Expand sidebar"
            keys={SIDEBAR_TOGGLE_KEYS}
            tooltipPlacement="right"
            onClick={toggleSidebar}
          />
        )}
      </nav>
    </div>
  );
};
