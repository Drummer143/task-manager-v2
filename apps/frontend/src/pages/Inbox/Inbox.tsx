import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { useSearchParam } from '../../shared/hooks/useSearchParam';
import { defaultWorkspaceId } from '../../shared/constants/routes';
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
import { useNotificationQueries } from './hooks/useNotificationQueries';
import { segmentedOptions, viewValidation } from './utils/constants';
import { useRegisterKeyboardHandlers } from './hooks/useRegisterKeyboardHandlers';
import { stepCursorOff } from './utils/cursor';
import { firstDayOfWeek, groupEntries } from './utils/grouping';
import { NotificationRowSkeleton } from '../../shared/ui/NotificationRow/NotificationRowSkeleton';

export const Inbox: React.FC = () => {
  const [view, setView] = useSearchParam('view', viewValidation);
  // No `?view=` (the sidebar's link) is the All tab
  const currentView = view ?? 'all';
  // The route is `/:workspace/inbox`; the default only stands in outside it (a story, a test)
  const { workspace = defaultWorkspaceId() } = useParams();

  const {
    onReadAll,
    onArchive,
    onUnarchive,
    isReadingAll,
    onMarkAsRead,
    notifications,
    pinned,
    isLoadingPinned,
    onMarkAsUnread,
    isNotificationsError,
    hasMoreNotifications,
    refetchNotifications,
    loadNextNotifications,
    isNextNotificationsError,
    isLoadingNextNotifications,
    isFirstLoadingNotifications,
  } = useNotificationQueries(workspace, view);

  // What the page shows, in order: the pinned Account group, then the list. The cursor, the
  // hotkeys and the step off an archived row walk this, so they work on pinned rows too
  const pinnedIds = new Set(pinned.map((n) => n.id));
  const feed = notifications.filter((n) => !pinnedIds.has(n.id));
  const visible = [...pinned, ...feed];

  const notificationsRef = useRef(visible);

  // After every render: the handlers read the rows as they are now
  useLayoutEffect(() => {
    notificationsRef.current = visible;
  });

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
    notifications: visible,
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

  const renderItem = (item: Notification, index: number) => (
    <InboxRow item={item} index={index} handlers={handlers} />
  );

  useEffect(() => () => useCursorStore.getState().clearCursor(), [view]);

  // Read once per visit: past midnight the groups keep their names until the page opens again
  const [now] = useState(() => new Date());
  const [weekStart] = useState(() => firstDayOfWeek());
  const entries = groupEntries(feed, currentView, now, weekStart, pinned);

  let content;

  if (isFirstLoadingNotifications || isLoadingPinned) {
    content = <NotificationRowSkeleton rows={6} />;
  } else if (isNotificationsError && visible.length === 0) {
    // Only with nothing to show: a failed next page or background refetch keeps the list
    content = (
      <ErrorState
        title="Couldn’t load notifications"
        reason="Check your connection and try again."
        onRetry={refetchNotifications}
      />
    );
  } else if (visible.length === 0) {
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
        entries={entries}
        renderItem={renderItem}
        hasMore={hasMoreNotifications}
        onEndReached={loadNextNotifications}
        footer={
          <InboxListFooter
            loading={isLoadingNextNotifications}
            failed={isNextNotificationsError}
            rowIndex={entries.length + 1}
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
