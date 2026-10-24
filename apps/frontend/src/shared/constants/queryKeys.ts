import { ListNotificationsView } from '@task-manager-v2/api/main/schemas';

export const QUERY_KEYS = {
  /** Everything of Inbox: the lists and the summary, for an invalidation. */
  inbox: ['inbox'],
  inboxSummary: ['inbox', 'summary'],
  /** Every workspace's lists, and nothing else: what the optimistic patches walk. */
  inboxLists: ['inbox', 'list'],
  // A workspace's Inbox tab: ['inbox', 'list', workspace, view]
  inboxWithView: (workspace: string, view: ListNotificationsView) => [
    'inbox',
    'list',
    workspace,
    view,
  ],
  /** The pinned Account group of every tab: what the optimistic patches walk. */
  inboxPinned: ['inbox', 'pinned'],
  // Per tab, as the lists: a pinned one read in Unread stays there until the tab changes, while
  // in All it moves to its place in the list (spec: Inbox · 01)
  inboxPinnedWithView: (view: ListNotificationsView) => [
    'inbox',
    'pinned',
    view,
  ],

  /** The user's workspaces (`GET /workspaces`). */
  workspaces: ['workspaces'],
  /** A slug the list did not know, resolved. */
  workspaceSlug: (slug: string) => ['workspaces', 'slug', slug],
  /** The user in a workspace (`GET /workspaces/{id}/me`). */
  workspaceMe: (workspaceId: string) => ['workspaces', workspaceId, 'me'],

  /** A workspace's pages tree, flat (`GET /workspaces/{id}/pages`). */
  pageTree: (workspaceId: string) => ['pages', workspaceId, 'tree'],
  /** A page opened by its address. */
  pageByShortId: (workspaceId: string, shortId: string) => ['pages', workspaceId, 'short', shortId],
} as const;

/** The tab of a pinned group's key (`inboxPinnedWithView`). */
export const inboxPinnedViewOf = (key: readonly unknown[]) => key[2];

/** The workspace and the tab of a list's key (`inboxWithView`). */
export const inboxListOf = (key: readonly unknown[]) => ({
  workspace: key[2],
  view: key[3],
});
