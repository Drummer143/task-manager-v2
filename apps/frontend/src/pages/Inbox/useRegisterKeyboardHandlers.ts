import {
  ListNotificationsView,
  Notification,
} from '@task-manager-v2/api/main/schemas';
import { useCursorStore, useRegisterHotkey } from '@task-manager-v2/ui-kit';

interface Props {
  notifications: Notification[];
  onReadAll: () => void;
  onMarkAsRead: (params: { ids: string[] }) => void;
  onMarkAsUnread: (params: { ids: string[] }) => void;
  onArchive: (notification: Notification) => void;
  onUnarchive: (notification: Notification) => void;
  setView: (view: ListNotificationsView) => void;
}

export const useRegisterKeyboardHandlers = ({
  notifications,
  onReadAll,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onUnarchive,
  setView,
}: Props) => {
  const highlighted = () => {
    const cursor = useCursorStore.getState().cursor;

    return notifications.find((n) => n.id === cursor);
  };

  useRegisterHotkey({
    key: 'u',
    shift: true,
    description: 'Mark all notifications as read',
    callback: () => onReadAll(),
  });

  useRegisterHotkey({
    key: 'u',
    description: 'Mark highlighted notification as read/unread',
    callback: () => {
      const n = highlighted();
      if (!n) return;
      (n.readAt ? onMarkAsUnread : onMarkAsRead)({ ids: [n.id] });
    },
  });

  useRegisterHotkey({
    key: 'e',
    description: 'Archive/Unarchive highlighted notification',
    callback: () => {
      const n = highlighted();
      if (!n) return;
      (n.archivedAt ? onUnarchive : onArchive)(n);
    },
  });

  useRegisterHotkey({
    key: 'a',
    chord: {
      key: 'g',
    },
    description: 'Show all notifications',
    callback: () => setView('all'),
  });

  useRegisterHotkey({
    key: 'u',
    chord: {
      key: 'g',
    },
    description: 'Show unread notifications',
    callback: () => setView('unread'),
  });

  useRegisterHotkey({
    key: 'e',
    chord: {
      key: 'g',
    },
    description: 'Show archived notifications',
    callback: () => setView('archived'),
  });
};
