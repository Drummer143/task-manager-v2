import React from 'react';
import { Avatar, Menu, Skeleton, tooltipProps, type MenuItem } from '@task-manager-v2/ui-kit';
import { ChevronDownIcon } from '@task-manager-v2/ui-kit/icons';
import type { SettingsGroup, SidebarUser, SidebarWorkspace } from './types';
import styles from './WorkspaceSwitcher.module.scss';

export interface WorkspaceSwitcherProps {
  /** `null` while it loads: a skeleton in the name's place. */
  workspace: SidebarWorkspace | null;
  workspaces: SidebarWorkspace[];
  user: SidebarUser;
  /** On the rail: only the mark, the menu opens to the right. */
  rail?: boolean;
  /** Unread per workspace id: a dot at the others in the list; the current one is ignored. */
  unreadByWorkspace?: Record<string, number>;
  /** Owner, or any role: Workspace settings, New workspace. */
  canWorkspaceSettings: boolean;
  /** `members.invite`. */
  canInvite: boolean;
  onWorkspaceChange(workspaceId: string): void;
  onSignOut(): void;
  /** Without them, their items are not in the menu: nowhere to go yet. */
  onOpenSettings?(group: SettingsGroup): void;
  onInvite?(): void;
  onNewWorkspace?(): void;
}

const MAX_COUNT = 99;

const unreadText = (count: number) => `${count > MAX_COUNT ? `${MAX_COUNT}+` : count} unread`;

/** Groups with a separator between them; an empty one leaves no separator behind. */
const joinGroups = (groups: MenuItem[][]): MenuItem[] =>
  groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [{ type: 'separator' } as const, ...group]));

/**
 * The workspace and the account (spec: Sidebar · 01): a ghost button with the workspace's mark
 * and name, and its menu — the workspaces to switch to, the workspace's own items, who is
 * signed in and the way out.
 */
export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  workspace,
  workspaces,
  user,
  rail = false,
  unreadByWorkspace,
  canWorkspaceSettings,
  canInvite,
  onWorkspaceChange,
  onSignOut,
  onOpenSettings,
  onInvite,
  onNewWorkspace,
}) => {
  if (!workspace) {
    return (
      <div className={rail ? styles.railLoading : styles.loading} role="status" aria-label="Loading workspace">
        <Skeleton.Block sunken width="var(--avatar-sm)" height="var(--avatar-sm)" />
        {!rail && <Skeleton.Line sunken width="60%" />}
      </div>
    );
  }

  const switchTo: MenuItem = {
    type: 'radio-group',
    id: 'workspaces',
    label: 'Workspaces',
    value: workspace.id,
    onValueChange: onWorkspaceChange,
    filterable: true,
    options: workspaces.map((each) => {
      const unread = each.id === workspace.id ? 0 : (unreadByWorkspace?.[each.id] ?? 0);

      return {
        value: each.id,
        label: each.name,
        icon: <Avatar shape="square" size="xs" name={each.name} id={each.id} src={each.iconUrl} />,
        // Its number is in the Inbox row already for the current one
        dot: unread > 0 ? unreadText(unread) : undefined,
      };
    }),
  };

  const items = joinGroups([
    [
      switchTo,
      ...(canWorkspaceSettings && onNewWorkspace
        ? [{ type: 'action', id: 'new-workspace', label: 'New workspace', onSelect: onNewWorkspace } as const]
        : []),
    ],
    [
      ...(canWorkspaceSettings && onOpenSettings
        ? [
            {
              type: 'action',
              id: 'workspace-settings',
              label: 'Workspace settings',
              onSelect: () => onOpenSettings('workspace'),
            } as const,
          ]
        : []),
      ...(canInvite && onInvite
        ? [{ type: 'action', id: 'invite', label: 'Invite members', onSelect: onInvite } as const]
        : []),
    ],
    [
      {
        type: 'label',
        label: user.name,
        content: (
          <span className={styles.user}>
            {/* The name is next to it: the picture would only say it twice */}
            <span aria-hidden="true">
              <Avatar size="md" name={user.name} id={user.id} src={user.avatarUrl} />
            </span>
            <span className={styles.who}>
              <span className={styles.userName}>{user.name}</span>
              {/* The space keeps the group's name "name email" without the column's CSS; the flex column drops it */}
              {user.email && (
                <>
                  {' '}
                  <span className={styles.email}>{user.email}</span>
                </>
              )}
            </span>
          </span>
        ),
      },
      ...(onOpenSettings
        ? [
            { type: 'action', id: 'profile', label: 'Profile', onSelect: () => onOpenSettings('account') } as const,
            {
              type: 'action',
              id: 'preferences',
              label: 'Preferences',
              // Not ⌘, — the browser on macOS keeps it for its own menu (spec: Sidebar · 01)
              keys: 'g ,',
              onSelect: () => onOpenSettings('preferences'),
            } as const,
          ]
        : []),
      { type: 'action', id: 'sign-out', label: 'Sign out', onSelect: onSignOut },
    ],
  ]);

  const trigger = rail ? (
    <button
      type="button"
      className={styles.railTrigger}
      data-sidebar-key="workspace"
      aria-label={`${workspace.name}, workspace menu`}
      {...tooltipProps({ text: workspace.name, placement: 'right' })}
    >
      {/* The button's label names the workspace already */}
      <Avatar shape="square" size="sm" name={workspace.name} id={workspace.id} src={workspace.iconUrl} aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      className={styles.trigger}
      data-sidebar-key="workspace"
      aria-label={`${workspace.name}, workspace menu`}
    >
      {/* The button's label names the workspace already */}
      <Avatar shape="square" size="sm" name={workspace.name} id={workspace.id} src={workspace.iconUrl} aria-hidden />
      <span className={styles.name} {...tooltipProps({ overflow: true })}>
        {workspace.name}
      </span>
      <ChevronDownIcon className={styles.chevron} aria-hidden="true" />
    </button>
  );

  return (
    <Menu
      items={items}
      trigger={trigger}
      side={rail ? 'right' : 'bottom'}
      align="start"
      aria-label="Workspace menu"
    />
  );
};
