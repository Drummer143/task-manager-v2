import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useSearchParam } from '../../shared/hooks/useSearchParam';
import {
  Button,
  EmptyState,
  ErrorState,
  Kbd,
  Segmented,
  useCursorStore,
} from '@task-manager-v2/ui-kit';
import {
  ListNotificationsView,
  Notification,
} from '@task-manager-v2/api/main/schemas';
import { InboxList } from './ui/InboxList';
import { InboxRow, type InboxRowHandlers } from './ui/InboxRow';
import { InboxListFooter } from './ui/InboxListFooter';
import styles from './Inbox.module.scss';
import { useNotificationQueries } from './useNotificationQueries';
import { segmentedOptions, viewValidation } from './utils';
import { useRegisterKeyboardHandlers } from './useRegisterKeyboardHandlers';
import { stepCursorOff } from './cursor';
import { NotificationRowSkeleton } from '../../shared/ui/NotificationRow/NotificationRowSkeleton';

export const Inbox: React.FC = () => {
  const [view, setView] = useSearchParam('view', viewValidation);
  // No `?view=` (the sidebar's link) is the All tab
  const currentView = view ?? 'all';

  const {
    onReadAll,
    onArchive,
    onUnarchive,
    isReadingAll,
    onMarkAsRead,
    notifications,
    onMarkAsUnread,
    isNotificationsError,
    hasMoreNotifications,
    refetchNotifications,
    loadNextNotifications,
    isLoadingNextNotifications,
    isNextNotificationsError,
    isFirstLoadingNotifications,
  } = useNotificationQueries(view);

  const notificationsRef = useRef(notifications);

  useLayoutEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Archive and Unarchive take the row out of the current tab: the highlight steps to its
  // neighbour first, from the keyboard (E) and from the row's button alike
  const archive = useCallback(
    (item: Notification) => {
      stepCursorOff(notificationsRef.current, item.id);
      onArchive(item);
    },
    [onArchive],
  );

  const unarchive = useCallback(
    (item: Notification) => {
      stepCursorOff(notificationsRef.current, item.id);
      onUnarchive(item);
    },
    [onUnarchive],
  );

  const readAllDisabled = currentView === 'archived';

  useRegisterKeyboardHandlers({
    notifications,
    readAllDisabled,
    onReadAll,
    onMarkAsRead,
    onMarkAsUnread,
    onArchive: archive,
    onUnarchive: unarchive,
    setView,
  });

  const handlers = useMemo<InboxRowHandlers>(
    () => ({
      markAsRead: (item) => onMarkAsRead({ ids: [item.id] }),
      markAsUnread: (item) => onMarkAsUnread({ ids: [item.id] }),
      archive,
      unarchive,
    }),
    [onMarkAsRead, onMarkAsUnread, archive, unarchive],
  );

  const renderItem = useCallback(
    (item: Notification, index: number) => (
      <InboxRow item={item} index={index} handlers={handlers} />
    ),
    [handlers],
  );

  useEffect(() => () => useCursorStore.getState().clearCursor(), [view]);

  let content;

  if (isFirstLoadingNotifications) {
    content = <NotificationRowSkeleton rows={6} />;
  } else if (isNotificationsError && notifications.length === 0) {
    // Only with nothing to show: a failed next page or background refetch keeps the list
    content = (
      <ErrorState
        title="Couldn’t load notifications"
        reason="Check your connection and try again."
        onRetry={refetchNotifications}
      />
    );
  } else if (notifications.length === 0) {
    switch (currentView) {
      case 'all':
        content = (
          <EmptyState
            title="No notifications yet"
            description="You’ll be notified when someone assigns you a task or mentions you."
          />
        );
        break;
      case 'archived':
        content = (
          <EmptyState
            title="Nothing archived"
            description={
              <>
                Press <Kbd keys="e" variant="inline" /> on a notification to
                archive it.
              </>
            }
          />
        );
        break;
      case 'unread':
        content = (
          <EmptyState
            title="You’re all caught up"
            description="New mentions and assignments will show up here."
            secondary={{
              label: 'View all',
              onAction: () => setView('all'),
              keys: 'g>a',
            }}
          />
        );
        break;
      default:
        throw new Error(`Invalid view: ${currentView satisfies never}`);
    }
  } else {
    content = (
      <InboxList
        items={notifications}
        renderItem={renderItem}
        hasMore={hasMoreNotifications}
        onEndReached={loadNextNotifications}
        footer={
          <InboxListFooter
            loading={isLoadingNextNotifications}
            failed={isNextNotificationsError}
            rowIndex={notifications.length + 1}
            onRetry={() => void loadNextNotifications()}
          />
        }
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <b>Inbox</b>

        <div className={styles.viewSwitcher}>
          <Segmented<ListNotificationsView>
            options={segmentedOptions}
            value={currentView}
            aria-label="Filter notifications"
            onValueChange={setView}
          />
        </div>

        <Button
          variant="ghost"
          keys="shift+U"
          onClick={() => onReadAll()}
          loading={isReadingAll}
          disabled={readAllDisabled}
        >
          Mark all read
        </Button>
      </div>

      {content}
    </div>
  );
};
