import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type {
  ListNotificationsView,
  Notification,
  NotificationPage,
  ReadNotificationRequest,
  UnreadNotificationRequest,
} from '@task-manager-v2/api/main/schemas';
import {
  archiveNotification,
  listNotifications,
  listPinnedAccountNotifications,
  readAllNotifications,
  readNotification,
  unarchiveNotification,
  unreadNotification,
} from '@task-manager-v2/api/main';
import { toast } from '@task-manager-v2/ui-kit';
import { useCallback } from 'react';
import { QUERY_KEYS } from '../../../shared/constants/queryKeys';
import {
  NO_PINNED,
  cachedNotification,
  hold,
  patchArchiveNotification,
  patchReadAll,
  patchReadNotification,
  refreshSummary,
  release,
} from '../../../shared/inbox/cache';

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
    onMutate: ({ ids }) => {
      hold(ids);

      return {
        uncounted: !ids.every(cachedNotification),
        rollback: patchReadNotification(ids, {
          readAt: new Date().toISOString(),
        }),
      };
    },
    onSettled: (data, error, { ids }, context) => {
      release(ids);
      if (context?.uncounted) refreshSummary();
    },
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
    onMutate: ({ before }) => {
      const patched = patchReadAll(workspace, before, new Date().toISOString());

      hold(patched.ids);

      return patched;
    },
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
    onSettled: (data, error, variables, context) => {
      release(context?.ids ?? []);
      refreshSummary();
    },
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
    onMutate: ({ ids }) => {
      hold(ids);

      return {
        uncounted: !ids.every(cachedNotification),
        rollback: patchReadNotification(ids, { readAt: null }),
      };
    },
    // Undo of read-all: most of its ids are past the loaded pages
    onSettled: (data, error, { ids }, context) => {
      release(ids);
      if (context?.uncounted) refreshSummary();
    },
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
    onMutate: (notification) => {
      hold([notification.id]);

      return {
        rollback: patchArchiveNotification(
          notification,
          new Date().toISOString(),
        ),
      };
    },
    onSettled: (data, error, { id }) => release([id]),
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
    onMutate: (notification) => {
      hold([notification.id]);

      return { rollback: patchArchiveNotification(notification, null) };
    },
    onSettled: (data, error, { id }) => release([id]),
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
    // Only with nothing to show: a failed refetch keeps the group it had
    isPinnedError:
      view !== 'archived' && pinnedQuery.isError && !pinnedQuery.data,
    refetchPinned: () => void pinnedQuery.refetch(),
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
