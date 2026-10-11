import type { ListNotificationsView, Notification } from '@task-manager-v2/api/main/schemas';

/**
 * The date a notification is ordered and grouped by (Inbox spec 04): when it last changed, in the
 * Archived tab when it was archived. One function for the sort, the groups and the cache, or they
 * would disagree and groups would interleave.
 */
export const sortDateOf = (view: ListNotificationsView, n: Notification) =>
  new Date(view === 'archived' ? (n.archivedAt ?? n.updatedAt) : n.updatedAt);
