import { useEffect } from 'react';
import { subscribeToChannel } from '../../app/socket';
import { invalidateTags, invalidateWorkspace, receiveDataChanged } from './invalidate';
import { tag } from './tags';

/**
 * Stale-data signals, for the whole app: the user's own channel (their workspaces) and the
 * channel of the workspace open, `workspaceId`. Mounted by the layout.
 */
export const useDataRealtime = (workspaceId: string | undefined) => {
  useEffect(() => {
    let joinedBefore = false;

    return subscribeToChannel({
      channelId: 'notifications',
      type: 'data.changed',
      onMessage: receiveDataChanged,
      // A rejoin follows a dropped connection: what came meanwhile was not delivered
      onJoin: () => {
        if (joinedBefore) invalidateTags([tag.workspaces()]);
        joinedBefore = true;
      },
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    let joinedBefore = false;

    return subscribeToChannel({
      channelId: `workspace:${workspaceId}`,
      type: 'data.changed',
      onMessage: receiveDataChanged,
      onJoin: () => {
        if (joinedBefore) void invalidateWorkspace(workspaceId);
        joinedBefore = true;
      },
    });
  }, [workspaceId]);
};
