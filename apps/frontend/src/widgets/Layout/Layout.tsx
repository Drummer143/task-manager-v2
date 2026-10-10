import { AppShell } from '@task-manager-v2/ui-kit';
import React, { useCallback } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import { ROUTES, defaultWorkspaceId, inboxPath } from '../../shared/constants/routes';
import { Sidebar, useSidebarHotkeys } from './Sidebar';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  // Outside the router's space route (a story) it is the default one
  const { workspace = defaultWorkspaceId() } = useParams();
  const inbox = inboxPath(workspace);
  const onInbox = useMatch(ROUTES.INBOX) !== null;

  useSidebarHotkeys(useCallback(() => navigate(inbox), [navigate, inbox]));

  return (
    <AppShell
      sidebar={<Sidebar inbox={{ href: inbox, current: onInbox }} />}
      header={<div>header</div>}
    >
      <Outlet />
    </AppShell>
  );
};
