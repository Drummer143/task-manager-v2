import { useEffect } from 'react';
import { subscribeToChannel } from '../../../app/socket';
import { receiveInboxUpdate, refetchInbox } from './useNotificationQueries';

/**
 * Inbox over the socket, for the whole app: the sidebar count stays right on every page, and the
 * Inbox page, once open, has its lists right (`receiveInboxUpdate`). Mounted by the layout.
 */
export const useInboxRealtime = () => {
  useEffect(() => {
    let joinedBefore = false;

    return subscribeToChannel({
      channelId: 'notifications',
      type: 'inbox.updated',
      onMessage: receiveInboxUpdate,
      // A rejoin follows a dropped connection: what came meanwhile was not delivered
      onJoin: () => {
        if (joinedBefore) void refetchInbox();
        joinedBefore = true;
      },
    });
  }, []);
};
