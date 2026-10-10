import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useSearchParam } from '../../shared/hooks/useSearchParam';
import { Button, Segmented, useCursorStore } from '@task-manager-v2/ui-kit';
import {
  ListNotificationsView,
  Notification,
} from '@task-manager-v2/api/main/schemas';
import { InboxList } from './ui/InboxList';
import { InboxRow, type InboxRowHandlers } from './ui/InboxRow';
import styles from './Inbox.module.scss';
import { useNotificationQueries } from './useNotificationQueries';
import { segmentedOptions, viewValidation } from './utils';
import { useRegisterKeyboardHandlers } from './useRegisterKeyboardHandlers';
import { stepCursorOff } from './cursor';

export const Inbox: React.FC = () => {
  const [view, setView] = useSearchParam('view', viewValidation);

  const {
    notifications,
    onMarkAsRead,
    onMarkAsUnread,
    onArchive,
    onUnarchive,
    isReadingAll,
    onReadAll,
    hasMoreNotifications,
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

  useRegisterKeyboardHandlers({
    notifications,
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

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <b>Inbox</b>

        <div className={styles.viewSwitcher}>
          <Segmented<ListNotificationsView>
            options={segmentedOptions}
            value={view ?? 'all'}
            aria-label="Filter notifications"
            onValueChange={setView}
          />
        </div>

        <Button
          variant="ghost"
          keys="shift+U"
          onClick={() => onReadAll()}
          loading={isReadingAll}
          disabled={view === 'archived'}
        >
          Mark all read
        </Button>
      </div>

      <InboxList
        items={notifications}
        renderItem={renderItem}
        hasMore={hasMoreNotifications}
      />
    </div>
  );
};
