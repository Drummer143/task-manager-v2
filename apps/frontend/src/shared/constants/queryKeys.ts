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
} as const;

/** The workspace and the tab of a list's key (`inboxWithView`). */
export const inboxListOf = (key: readonly unknown[]) => ({
  workspace: key[2],
  view: key[3],
});
