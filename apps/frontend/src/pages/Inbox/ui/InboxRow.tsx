import React, { memo, useMemo } from 'react';
import { Avatar, useCursorStore } from '@task-manager-v2/ui-kit';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import { ArchiveIcon, ArchiveRestoreIcon, MarkReadIcon, MarkUnreadIcon } from '@task-manager-v2/ui-kit/icons';
import { NotificationRow, type NotificationAction } from '../../../shared/ui/NotificationRow';
import { inboxRowId } from './InboxList';

export interface InboxRowHandlers {
  markAsRead(notification: Notification): void;
  markAsUnread(notification: Notification): void;
  archive(notification: Notification): void;
  unarchive(notification: Notification): void;
}

export interface InboxRowProps {
  item: Notification;
  index: number;
  handlers: InboxRowHandlers;
}

const contentOf = (item: Notification) => {
  switch (item.kind) {
    case 'debug':
      return {
        title: 'Debug notification',
        context: item.facts.message,
        avatar: <Avatar id={item.userId} name="" />,
      };
    default:
      throw new Error(`Unknown notification kind: ${item.kind}`);
  }
};

export const InboxRow: React.FC<InboxRowProps> = memo(({ item, index, handlers }) => {
  const cursor = useCursorStore((state) => state.cursor === item.id);
  const { title, context, avatar } = contentOf(item);

  const actions = useMemo<NotificationAction[]>(
    () => [
      item.readAt
        ? { icon: <MarkUnreadIcon />, label: 'Mark as unread', keys: 'u', onClick: () => handlers.markAsUnread(item) }
        : { icon: <MarkReadIcon />, label: 'Mark as read', keys: 'u', onClick: () => handlers.markAsRead(item) },
      item.archivedAt
        ? { icon: <ArchiveRestoreIcon />, label: 'Unarchive', keys: 'e', onClick: () => handlers.unarchive(item) }
        : { icon: <ArchiveIcon />, label: 'Archive', keys: 'e', onClick: () => handlers.archive(item) },
    ],
    [item, handlers],
  );

  return (
    <NotificationRow
      id={inboxRowId(item.id)}
      rowIndex={index + 1}
      href="#"
      unread={item.readAt === null}
      title={title}
      context={context}
      avatar={avatar}
      time={new Date(item.updatedAt)}
      cursor={cursor}
      actions={actions}
    />
  );
});

InboxRow.displayName = 'InboxRow';
