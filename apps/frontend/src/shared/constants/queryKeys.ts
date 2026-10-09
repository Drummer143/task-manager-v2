import { ListNotificationsView } from "@task-manager-v2/api/main/schemas";

export const QUERY_KEYS = {
  inbox: ['inbox'],
  inboxWithView: (view: ListNotificationsView) => ['inbox', view],
} as const;
