import { Notification } from '@task-manager-v2/api/main/schemas';
import { useCursorStore, useRegisterHotkey } from '@task-manager-v2/ui-kit';
import { useLayoutEffect, useMemo, useRef } from 'react';

export const useRegisterKeyboardHandlers = ({
  notifications,
  onReadAll,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onUnarchive,
}: {
  notifications: Notification[];
  onReadAll: () => void;
  onMarkAsRead: (params: { ids: string[] }) => void;
  onMarkAsUnread: (params: { ids: string[] }) => void;
  onArchive: (notification: Notification) => void;
  onUnarchive: (notification: Notification) => void;
}) => {
  const notificationsRef = useRef<Notification[]>(notifications);

  useLayoutEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const readAllConfig = useMemo(
    () => ({
      callback: () => onReadAll(),
      description: 'Mark all notifications as read',
      key: 'u',
      shift: true,
    }),
    [onReadAll],
  );

  const markAsReadConfig = useMemo(
    () => ({
      callback: () => {
        const cursor = useCursorStore.getState().cursor;

        if (!cursor) return;

        const notification = notificationsRef.current.find(
          (n) => n.id === cursor,
        );
        if (!notification) return;

        if (notification.readAt) {
          onMarkAsUnread({ ids: [cursor] });
        } else {
          onMarkAsRead({ ids: [cursor] });
        }
      },
      description: 'Mark highlighted notification as read/unread',
      key: 'u',
    }),
    [onMarkAsRead, onMarkAsUnread],
  );

  const archiveConfig = useMemo(
    () => ({
      callback: () => {
        const cursor = useCursorStore.getState().cursor;

        if (!cursor) return;

        const notification = notificationsRef.current.find(
          (n) => n.id === cursor,
        );
        if (!notification) return;

        if (notification.archivedAt) {
          onUnarchive(notification);
        } else {
          onArchive(notification);
        }
      },
      description: 'Archive/Unarchive highlighted notification',
      key: 'e',
    }),
    [onArchive, onUnarchive],
  );

  useRegisterHotkey(readAllConfig);
  useRegisterHotkey(markAsReadConfig);
  useRegisterHotkey(archiveConfig);
};
