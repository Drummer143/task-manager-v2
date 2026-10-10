import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import {
  ListNotificationsView,
  Notification,
  NotificationPage,
  ReadNotificationRequest,
  SummaryResponse,
  UnreadNotificationRequest,
} from '@task-manager-v2/api/main/schemas';
import {
  QUERY_KEYS,
  inboxListOf,
  inboxPinnedViewOf,
} from '../../../shared/constants/queryKeys';
import { sortDateOf } from '../utils/grouping';
import {
  archiveNotification,
  listNotifications,
  listPinnedAccountNotifications,
  readAllNotifications,
  readNotification,
  unarchiveNotification,
  unreadNotification,
} from '@task-manager-v2/api/main';
import { queryClient } from '../../../app/queryClient';
import { toast } from '@task-manager-v2/ui-kit';
import { useCallback } from 'react';

type InboxData = InfiniteData<NotificationPage, string | undefined>;
/** The pinned Account group of one tab. */
type PinnedData = Notification[];

/** What the summary counts (`count_unread`): neither read nor archived. */
const isUnread = (n: Notification) => !n.readAt && !n.archivedAt;

/** A notification as the cache has it, in a list or pinned, the first copy found. */
const cachedNotification = (id: string) =>
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
const refreshSummary = () => {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboxSummary });
  // Undo of read-all brings account-level ones back to unread: they are pinned again
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboxPinned });
};

/**
 * Reads or unreads notifications in place, in every cached list and pinned group. A pinned one
 * read in the All tab leaves the group for its place in the All lists (spec: Inbox · 01); in the
 * Unread tab it stays until the tab changes, like any row read there.
 */
const patchReadNotification = (
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
const patchReadAll = (workspace: string, before: string, readAt: string) => {
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

const NO_PINNED: Notification[] = [];

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

const patchArchiveNotification = (
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

export const useNotificationQueries = (
  workspace: string,
  view: ListNotificationsView | null,
) => {
  const {
    data: notifications = [],
    hasNextPage: hasMoreNotifications,
    isLoading: isFirstLoadingNotifications,
    fetchNextPage: loadNextNotifications,
    isFetchingNextPage: isLoadingNextNotifications,
    isFetchNextPageError: isNextNotificationsError,
    isError: isNotificationsError,
    refetch: refetchNotifications,
  } = useInfiniteQuery<
    NotificationPage,
    Error,
    Notification[],
    string[],
    string | undefined
  >({
    queryKey: QUERY_KEYS.inboxWithView(workspace, view ?? 'all'),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      listNotifications(
        { workspace, cursor: pageParam, view: view ?? 'all' },
        { signal },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data),
  });

  // The Account group: in the Unread and All tabs, not in Archived (spec: Inbox · 01)
  const pinnedQuery = useQuery({
    queryKey: QUERY_KEYS.inboxPinnedWithView(view ?? 'all'),
    queryFn: ({ signal }) =>
      listPinnedAccountNotifications({ signal }).then(({ data }) => data),
    enabled: view !== 'archived',
  });
  const pinned =
    view === 'archived' ? NO_PINNED : (pinnedQuery.data ?? NO_PINNED);

  // Every mutation here is `mutate`, not `mutateAsync`: nobody awaits them, and a failure is
  // handled in onError (rollback, toast), not rejected into an unhandled promise
  const { mutate: markAsRead } = useMutation({
    mutationFn: (data: ReadNotificationRequest) => readNotification(data),
    onMutate: ({ ids }) => ({
      uncounted: !ids.every(cachedNotification),
      rollback: patchReadNotification(ids, {
        readAt: new Date().toISOString(),
      }),
    }),
    onSettled: (data, error, variables, context) =>
      context?.uncounted && refreshSummary(),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t mark as read. Changes were undone.',
        retry: () => markAsRead(data),
      });
    },
  });

  // `before` is a variable, not read inside: the optimistic patch and the server must agree on it
  const { mutate: readAllBefore, isPending: isReadingAll } = useMutation({
    mutationFn: ({ before }: { before: string }) =>
      readAllNotifications({ workspace, before }),
    onMutate: ({ before }) =>
      patchReadAll(workspace, before, new Date().toISOString()),
    onSuccess: (data, variables, context) => {
      // What the cache read but the server did not (an event that came in the meantime) is
      // unread again; what the server read beyond the loaded pages is not in the cache anyway
      const affected = new Set(data.affected);
      const notRead = context.ids.filter((id) => !affected.has(id));

      if (notRead.length > 0) patchReadNotification(notRead, { readAt: null });

      if (data.affected.length === 0) return;

      toast.undo({
        message: `Marked ${data.affected.length} as read`,
        undo: () => markAsUnread({ ids: data.affected }),
      });
    },
    // The server read beyond the loaded pages too
    onSettled: () => refreshSummary(),
    onError: (error, variables, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t mark all read. Changes were undone.',
        retry: () => readAllBefore(variables),
      });
    },
  });

  const readAll = () => readAllBefore({ before: new Date().toISOString() });

  const { mutate: markAsUnread } = useMutation({
    mutationFn: (data: UnreadNotificationRequest) => unreadNotification(data),
    onMutate: ({ ids }) => ({
      uncounted: !ids.every(cachedNotification),
      rollback: patchReadNotification(ids, { readAt: null }),
    }),
    // Undo of read-all: most of its ids are past the loaded pages
    onSettled: (data, error, variables, context) =>
      context?.uncounted && refreshSummary(),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t mark as unread. Changes were undone.',
        retry: () => markAsUnread(data),
      });
    },
  });

  const { mutate: archive } = useMutation({
    mutationFn: ({ id }: Notification) => archiveNotification({ id }),
    onMutate: (notification) => ({
      rollback: patchArchiveNotification(
        notification,
        new Date().toISOString(),
      ),
    }),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t archive. Changes were undone.',
        retry: () => archive(data),
      });
    },
  });

  const { mutate: unarchive } = useMutation({
    mutationFn: ({ id }: Notification) => unarchiveNotification({ id }),
    onMutate: (notification) => ({
      rollback: patchArchiveNotification(notification, null),
    }),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t unarchive. Changes were undone.',
        retry: () => unarchive(data),
      });
    },
  });

  const onArchive = useCallback(
    (notification: Notification) => {
      toast.undo({
        message: 'Archived',
        undo: () => unarchive(notification),
        redo: () => archive(notification),
      });

      archive(notification);
    },
    [archive, unarchive],
  );

  const onUnarchive = useCallback(
    (notification: Notification) => {
      toast.undo({
        message: 'Unarchived',
        undo: () => archive(notification),
        redo: () => unarchive(notification),
      });

      unarchive(notification);
    },
    [unarchive, archive],
  );

  return {
    notifications,
    pinned,
    isLoadingPinned: pinnedQuery.isLoading,
    hasMoreNotifications,
    isNotificationsError,
    refetchNotifications,
    loadNextNotifications,
    isNextNotificationsError,
    isLoadingNextNotifications,
    isFirstLoadingNotifications,

    isReadingAll,
    onReadAll: readAll,

    onMarkAsRead: markAsRead,

    onMarkAsUnread: markAsUnread,

    onArchive: onArchive,

    onUnarchive: onUnarchive,
  };
};
