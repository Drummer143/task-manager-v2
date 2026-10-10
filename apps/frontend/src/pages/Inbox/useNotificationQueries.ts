import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
} from '@tanstack/react-query';
import {
  ListNotificationsView,
  Notification,
  NotificationPage,
  ReadNotificationRequest,
  UnreadNotificationRequest,
} from '@task-manager-v2/api/main/schemas';
import { QUERY_KEYS } from '../../shared/constants/queryKeys';
import {
  archiveNotification,
  listNotifications,
  readAllNotifications,
  readNotification,
  unarchiveNotification,
  unreadNotification,
} from '@task-manager-v2/api/main';
import { queryClient } from '../../app/queryClient';
import { toast } from '@task-manager-v2/ui-kit';
import { useCallback } from 'react';

type InboxData = InfiniteData<NotificationPage, string | undefined>;

const patchReadNotification = (
  ids: string[],
  patch: Partial<Pick<Notification, 'readAt'>>,
) => {
  const snapshot = queryClient.getQueriesData<InboxData>({
    queryKey: QUERY_KEYS.inbox,
  });

  queryClient.setQueriesData<InboxData>(
    { queryKey: QUERY_KEYS.inbox },
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

  return () =>
    snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
};

const VIEWS: readonly ListNotificationsView[] = ['all', 'unread', 'archived'];

const isView = (value: unknown): value is ListNotificationsView =>
  VIEWS.includes(value as ListNotificationsView);

const belongsTo = (view: ListNotificationsView, n: Notification) => {
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
  const at = (n: Notification) =>
    Date.parse(
      view === 'archived' ? (n.archivedAt ?? n.updatedAt) : n.updatedAt,
    );

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

const patchArchiveNotification = (
  notification: Notification,
  archivedAt: string | null,
) => {
  const snapshot = queryClient.getQueriesData<InboxData>({
    queryKey: QUERY_KEYS.inbox,
  });

  const current =
    snapshot
      .flatMap(([, data]) => data?.pages.flatMap((page) => page.data) ?? [])
      .find((n) => n.id === notification.id) ?? notification;

  const next: Notification = {
    ...current,
    archivedAt,
    readAt: archivedAt ? (current.readAt ?? archivedAt) : current.readAt,
  };

  snapshot.forEach(([key, data]) => {
    const view = key[1];

    if (data && isView(view)) {
      queryClient.setQueryData<InboxData>(key, place(view, data, next));
    }
  });

  return () =>
    snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
};

export const useNotificationQueries = (view: ListNotificationsView | null) => {
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
    queryKey: QUERY_KEYS.inboxWithView(view ?? 'all'),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      listNotifications({ cursor: pageParam, view: view ?? 'all' }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data),
  });

  const { mutateAsync: markAsRead } = useMutation({
    mutationFn: (data: ReadNotificationRequest) => readNotification(data),
    onMutate: ({ ids }) => ({
      rollback: patchReadNotification(ids, {
        readAt: new Date().toISOString(),
      }),
    }),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t mark as read. Changes were undone.',
        retry: () => markAsRead(data),
      });
    },
  });

  const { mutateAsync: readAll, isPending: isReadingAll } = useMutation({
    mutationFn: () =>
      readAllNotifications({ before: new Date().toISOString() }),
    onSuccess: (data) => {
      if (data.affected.length === 0) return;

      toast.undo({
        message: `Marked ${data.affected.length} as read`,
        undo: () => markAsUnread({ ids: data.affected }),
      });
    },
    onError: () => {
      toast.error({
        message: 'Couldn’t mark all read. Changes were undone.',
      });
    },
  });

  const { mutateAsync: markAsUnread } = useMutation({
    mutationFn: (data: UnreadNotificationRequest) => unreadNotification(data),
    onMutate: ({ ids }) => ({
      rollback: patchReadNotification(ids, { readAt: null }),
    }),
    onError: (error, data, context) => {
      context?.rollback();

      toast.error({
        message: 'Couldn’t mark as unread. Changes were undone.',
        retry: () => markAsUnread(data),
      });
    },
  });

  const { mutateAsync: archive } = useMutation({
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

  const { mutateAsync: unarchive } = useMutation({
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
    hasMoreNotifications,
    isNotificationsError,
    refetchNotifications,
    loadNextNotifications,
    isLoadingNextNotifications,
    isNextNotificationsError,
    isFirstLoadingNotifications,

    isReadingAll,
    onReadAll: readAll,

    onMarkAsRead: markAsRead,

    onMarkAsUnread: markAsUnread,

    onArchive: onArchive,

    onUnarchive: onUnarchive,
  };
};
