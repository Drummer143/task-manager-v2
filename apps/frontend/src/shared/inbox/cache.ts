/**
 * The Inbox cache, outside of any screen: the optimistic patches of the Inbox actions and what
 * the socket's `inbox.updated` does to the lists, the pinned group and the summary. The Inbox page
 * patches through it; the layout's realtime hook feeds it on every page.
 */
import type { InfiniteData } from '@tanstack/react-query';
import type {
  InboxUpdated,
  ListNotificationsView,
  Notification,
  NotificationPage,
  SummaryResponse,
} from '@task-manager-v2/api/main/schemas';
import { queryClient } from '../../app/queryClient';
import {
  QUERY_KEYS,
  inboxListOf,
  inboxPinnedViewOf,
} from '../constants/queryKeys';
import { useRemoteFlashStore } from './remoteFlash';
import { sortDateOf } from './sortDate';

type InboxData = InfiniteData<NotificationPage, string | undefined>;
/** The pinned Account group of one tab. */
type PinnedData = Notification[];

/** What the summary counts (`count_unread`): neither read nor archived. */
const isUnread = (n: Notification) => !n.readAt && !n.archivedAt;

/** A notification as the cache has it, in a list or pinned, the first copy found. */
export const cachedNotification = (id: string) =>
  [
    ...queryClient
      .getQueriesData<InboxData>({ queryKey: QUERY_KEYS.inboxLists })
      .flatMap(([, data]) => data?.pages.flatMap((page) => page.data) ?? []),
    ...queryClient
      .getQueriesData<PinnedData>({ queryKey: QUERY_KEYS.inboxPinned })
      .flatMap(([, data]) => data ?? []),
  ].find((n) => n.id === id);

/** Every cached list and pinned group as they are now; returns a rollback to that. */
const snapshotInbox = () => {
  const lists = queryClient.getQueriesData<InboxData>({
    queryKey: QUERY_KEYS.inboxLists,
  });
  const pinned = queryClient.getQueriesData<PinnedData>({
    queryKey: QUERY_KEYS.inboxPinned,
  });

  return () =>
    [...lists, ...pinned].forEach(([key, data]) =>
      queryClient.setQueryData(key, data),
    );
};

/**
 * Moves the unread counts by what a change did to each notification: -1 where an unread one
 * stops being unread, +1 the other way. Returns a rollback.
 */
const patchSummary = (
  changes: { before: Notification; after: Notification }[],
) => {
  const previous = queryClient.getQueryData<SummaryResponse>(
    QUERY_KEYS.inboxSummary,
  );

  if (!previous) return () => undefined;

  let next = previous;

  for (const { before, after } of changes) {
    const delta = Number(isUnread(after)) - Number(isUnread(before));

    if (delta === 0) continue;

    const workspace = after.workspaceId;
    next = workspace
      ? {
          ...next,
          byWorkspace: {
            ...next.byWorkspace,
            [workspace]: Math.max(
              0,
              (next.byWorkspace[workspace] ?? 0) + delta,
            ),
          },
        }
      : { ...next, accountUnread: Math.max(0, next.accountUnread + delta) };
  }

  if (next === previous) return () => undefined;

  // A summary on its way would answer for the state before this change
  void queryClient.cancelQueries({ queryKey: QUERY_KEYS.inboxSummary });
  queryClient.setQueryData(QUERY_KEYS.inboxSummary, next);

  return () => queryClient.setQueryData(QUERY_KEYS.inboxSummary, previous);
};

/**
 * The summary from the server: after a change the cache could not count, because some of its
 * notifications are not loaded (read-all, its undo).
 */
export const refreshSummary = () => {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboxSummary });
  // Undo of read-all brings account-level ones back to unread: they are pinned again
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboxPinned });
};

/**
 * Reads or unreads notifications in place, in every cached list and pinned group. A pinned one
 * read in the All tab leaves the group for its place in the All lists (spec: Inbox · 01); in the
 * Unread tab it stays until the tab changes, like any row read there.
 */
/**
 * Notifications whose own change is on its way, by count. A socket event about one of them
 * describes an older state than the page shows; it is skipped, and the server's answer wins
 * (backend spec, notifications §4.5).
 */
const inFlight = new Map<string, number>();

/** A server summary was skipped while changes were in flight: fetch it once they settle. */
let summaryBehind = false;

export const hold = (ids: readonly string[]) =>
  ids.forEach((id) => inFlight.set(id, (inFlight.get(id) ?? 0) + 1));

export const release = (ids: readonly string[]) => {
  ids.forEach((id) => {
    const left = (inFlight.get(id) ?? 1) - 1;

    if (left > 0) inFlight.set(id, left);
    else inFlight.delete(id);
  });

  if (inFlight.size === 0 && summaryBehind) {
    summaryBehind = false;
    refreshSummary();
  }
};

export const patchReadNotification = (
  ids: string[],
  patch: Partial<Pick<Notification, 'readAt'>>,
) => {
  const rollbackCache = snapshotInbox();

  const rollbackSummary = patchSummary(
    ids.flatMap((id) => {
      const before = cachedNotification(id);

      return before ? [{ before, after: { ...before, ...patch } }] : [];
    }),
  );

  queryClient.setQueriesData<InboxData>(
    { queryKey: QUERY_KEYS.inboxLists },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.map((n) =>
            ids.includes(n.id) ? { ...n, ...patch } : n,
          ),
        })),
      },
  );

  queryClient
    .getQueriesData<PinnedData>({ queryKey: QUERY_KEYS.inboxPinned })
    .forEach(([key, data]) => {
      if (!data) return;

      const moving: Notification[] = [];
      const next = data.flatMap((n) => {
        if (!ids.includes(n.id)) return [n];

        const changed = { ...n, ...patch };

        if (inboxPinnedViewOf(key) === 'all' && !isUnread(changed)) {
          moving.push(changed);
          return [];
        }

        return [changed];
      });

      queryClient.setQueryData<PinnedData>(key, next);
      moving.forEach((n) => placeInLists(n, ['all']));
    });

  return () => {
    rollbackCache();
    rollbackSummary();
  };
};

/**
 * What the server's read-all reads (`mark_as_read_all`): the unread, not archived notifications of
 * the workspace and of the account, whose last event is not after `before`. Marks them read in
 * every cached tab of that workspace and in the pinned groups; returns their ids and a rollback.
 */
export const patchReadAll = (
  workspace: string,
  before: string,
  readAt: string,
) => {
  const limit = Date.parse(before);
  const ids = new Set<string>();

  const isRead = (n: Notification) =>
    (n.workspaceId === workspace || n.workspaceId === null) &&
    n.readAt === null &&
    n.archivedAt === null &&
    Date.parse(n.updatedAt) <= limit;

  queryClient
    .getQueriesData<InboxData>({ queryKey: QUERY_KEYS.inboxLists })
    .forEach(([key, data]) => {
      if (inboxListOf(key).workspace !== workspace) return;

      data?.pages.forEach((page) =>
        page.data.forEach((n) => isRead(n) && ids.add(n.id)),
      );
    });

  // The pinned ones are account-level and unread: read-all reads them too
  queryClient
    .getQueriesData<PinnedData>({ queryKey: QUERY_KEYS.inboxPinned })
    .forEach(([, data]) => data?.forEach((n) => isRead(n) && ids.add(n.id)));

  return {
    ids: [...ids],
    rollback: patchReadNotification([...ids], { readAt }),
  };
};

const VIEWS: readonly ListNotificationsView[] = ['all', 'unread', 'archived'];

export const NO_PINNED: Notification[] = [];

const isView = (value: unknown): value is ListNotificationsView =>
  VIEWS.includes(value as ListNotificationsView);

const belongsTo = (view: ListNotificationsView, n: Notification) => {
  // An unread account-level one is pinned above the list, never in it (spec: Inbox · 01)
  if (n.workspaceId === null && isUnread(n)) return false;

  switch (view) {
    case 'unread':
      return !n.readAt && !n.archivedAt;
    case 'all':
      return !n.archivedAt;
    case 'archived':
      return !!n.archivedAt;
  }
};

const comesBefore = (
  view: ListNotificationsView,
  a: Notification,
  b: Notification,
) => {
  // The same date the groups use (grouping.ts)
  const at = (n: Notification) => sortDateOf(view, n).getTime();

  return at(a) !== at(b) ? at(a) > at(b) : a.id > b.id;
};

const place = (
  view: ListNotificationsView,
  data: InboxData,
  notification: Notification,
): InboxData => {
  const pages = data.pages.map((page) => ({
    ...page,
    data: page.data.filter((n) => n.id !== notification.id),
  }));

  if (!belongsTo(view, notification)) return { ...data, pages };

  for (const page of pages) {
    const index = page.data.findIndex((n) =>
      comesBefore(view, notification, n),
    );

    if (index !== -1) {
      page.data.splice(index, 0, notification);
      return { ...data, pages };
    }
  }

  const last = pages.at(-1);

  if (last && !last.nextCursor) last.data.push(notification);

  return { ...data, pages };
};

/**
 * Puts a notification where it belongs in the cached lists: its own workspace's, or every
 * workspace's for an account-level one. `views` limits the tabs.
 */
function placeInLists(
  notification: Notification,
  views: readonly ListNotificationsView[] = VIEWS,
) {
  queryClient
    .getQueriesData<InboxData>({ queryKey: QUERY_KEYS.inboxLists })
    .forEach(([key, data]) => {
      const { workspace, view } = inboxListOf(key);

      if (
        data &&
        (workspace === notification.workspaceId ||
          notification.workspaceId === null) &&
        isView(view) &&
        views.includes(view)
      ) {
        queryClient.setQueryData<InboxData>(
          key,
          place(view, data, notification),
        );
      }
    });
}

export const patchArchiveNotification = (
  notification: Notification,
  archivedAt: string | null,
) => {
  const rollbackCache = snapshotInbox();

  const current = cachedNotification(notification.id) ?? notification;

  const next: Notification = {
    ...current,
    archivedAt,
    readAt: archivedAt ? (current.readAt ?? archivedAt) : current.readAt,
  };

  const rollbackSummary = patchSummary([{ before: current, after: next }]);

  placeInLists(next);

  // Archived is read: it leaves the pinned groups (unarchived, it stays read and in the lists)
  queryClient.setQueriesData<PinnedData>(
    { queryKey: QUERY_KEYS.inboxPinned },
    (data) => data?.filter((n) => n.id !== next.id),
  );

  return () => {
    rollbackCache();
    rollbackSummary();
  };
};

/**
 * Puts a notification into the pinned groups if it belongs there (account-level and unread), newest
 * first, and takes it out of them otherwise.
 */
const placeInPinned = (notification: Notification) => {
  const pinned = notification.workspaceId === null && isUnread(notification);

  queryClient.setQueriesData<PinnedData>(
    { queryKey: QUERY_KEYS.inboxPinned },
    (data) => {
      if (!data) return data;

      const rest = data.filter((n) => n.id !== notification.id);

      if (!pinned) return rest;

      return [notification, ...rest].sort(
        (a, b) =>
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
          (a.id < b.id ? 1 : -1),
      );
    },
  );
};

/** Replaces the cached copies of notifications where they are, moving nothing. */
const replaceInPlace = (changed: readonly Notification[]) => {
  const byId = new Map(changed.map((n) => [n.id, n]));
  const swap = (n: Notification) => byId.get(n.id) ?? n;

  queryClient.setQueriesData<InboxData>(
    { queryKey: QUERY_KEYS.inboxLists },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.map(swap),
        })),
      },
  );
  queryClient.setQueriesData<PinnedData>(
    { queryKey: QUERY_KEYS.inboxPinned },
    (data) => data?.map(swap),
  );
};

/** The read-all of another tab: the same rule as `patchReadAll`, applied in place. */
const readAllInPlace = ({
  workspace,
  before,
  readAt,
}: NonNullable<InboxUpdated['readAll']>) => {
  const limit = Date.parse(before);

  const read = (n: Notification) =>
    (n.workspaceId === workspace || n.workspaceId === null) &&
    n.readAt === null &&
    n.archivedAt === null &&
    Date.parse(n.updatedAt) <= limit &&
    !inFlight.has(n.id)
      ? { ...n, readAt }
      : n;

  queryClient.setQueriesData<InboxData>(
    { queryKey: QUERY_KEYS.inboxLists },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.map(read),
        })),
      },
  );
  queryClient.setQueriesData<PinnedData>(
    { queryKey: QUERY_KEYS.inboxPinned },
    (data) => data?.map(read),
  );
};

/**
 * `inbox.updated` from the socket: what a change did, here or in another tab (spec: Inbox · 10).
 * Applied to the cache, nothing refetched, so the cursor and the scroll stay:
 * - new: at its place by time in its list, or pinned; tinted for --highlight-remote;
 * - moved to another tab (archived, unarchived): taken there;
 * - read or unread: changed where it is (a row read in Unread stays until the tab changes);
 * - a read-all: its rule, in place;
 * - the counts: set as the server sent them.
 * Within the loaded pages only: past them it comes with the next page.
 */
export const receiveInboxUpdate = ({
  upserted = [],
  readAll,
  summary,
}: InboxUpdated) => {
  const arrived: string[] = [];
  const inPlace: Notification[] = [];

  for (const notification of upserted) {
    if (inFlight.has(notification.id)) {
      summaryBehind = true;
      continue;
    }

    const known = cachedNotification(notification.id);

    if (known && known.archivedAt === notification.archivedAt) {
      inPlace.push(notification);
      continue;
    }

    placeInPinned(notification);
    placeInLists(notification);

    if (!known) arrived.push(notification.id);
  }

  replaceInPlace(inPlace);

  if (readAll) readAllInPlace(readAll);

  if (inFlight.size > 0) {
    // It counts without the changes still on their way; their settling fetches it
    summaryBehind = true;
  } else {
    void queryClient.cancelQueries({ queryKey: QUERY_KEYS.inboxSummary });
    queryClient.setQueryData(QUERY_KEYS.inboxSummary, summary);
  }

  if (arrived.length > 0) useRemoteFlashStore.getState().flash(arrived);
};

/** After the socket was away: what came meanwhile is unknown, so everything is fetched again. */
export const refetchInbox = () =>
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inbox });
