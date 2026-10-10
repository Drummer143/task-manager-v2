import { AppShell } from '@task-manager-v2/ui-kit';
import React from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import {
  ROUTES,
  defaultWorkspaceId,
  inboxPath,
} from '../../shared/constants/routes';
import { Sidebar, useSidebarHotkeys } from './Sidebar';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../../shared/constants/queryKeys';
import { getNotificationSummary } from '@task-manager-v2/api/main';

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

  return (
    <AppShell
      sidebar={
        <Sidebar
          inbox={{
            href: inbox,
            current: onInbox,
            // This workspace's own unread (decided 2026-10-10: not + accountUnread)
            unread: summary?.byWorkspace[workspace],
          }}
        />
      }
      header={<div>header</div>}
    >
      <Outlet />
    </AppShell>
  );
};
