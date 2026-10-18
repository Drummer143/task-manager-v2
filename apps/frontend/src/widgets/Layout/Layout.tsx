import { AppShell } from '@task-manager-v2/ui-kit';
import React from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import {
  NIL_WORKSPACE_ID,
  ROUTES,
  defaultWorkspaceId,
  inboxPath,
} from '../../shared/constants/routes';
import { Sidebar, useSidebarHotkeys } from './Sidebar';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../../shared/constants/queryKeys';
import { getNotificationSummary } from '@task-manager-v2/api/main';
import { useInboxRealtime } from '../../shared/inbox/useInboxRealtime';
import { useDataRealtime } from '../../shared/realtime/useDataRealtime';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  // Outside the router's space route (a story) it is the default one
  const { workspace = defaultWorkspaceId() } = useParams();
  const inbox = inboxPath(workspace);
  const onInbox = useMatch(ROUTES.INBOX) !== null;

  const { data: summary } = useQuery({
    queryKey: QUERY_KEYS.inboxSummary,
    queryFn: () => getNotificationSummary(),
  });

  useSidebarHotkeys(() => navigate(inbox));
  // For the whole app, not only the Inbox page: the sidebar count stays right everywhere
  useInboxRealtime();
  // TODO(workspaces): the nil uuid stands for "no workspace yet"; its channel would be refused
  useDataRealtime(workspace === NIL_WORKSPACE_ID ? undefined : workspace);

  return (
    <AppShell
      sidebar={
        <Sidebar
          inbox={{
            href: inbox,
            current: onInbox,
            unread:
              summary &&
              (summary.byWorkspace[workspace] ?? 0) + summary.accountUnread,
          }}
        />
      }
      header={<div>header</div>}
    >
      <Outlet />
    </AppShell>
  );
};
