import { ListNotificationsView } from "@task-manager-v2/api/main/schemas";

export const QUERY_KEYS = {
  inbox: ['inbox'],
  // A workspace's Inbox: the prefix `inbox` still reaches every workspace's lists
  inboxWithView: (workspace: string, view: ListNotificationsView) => ['inbox', workspace, view],
} as const;
