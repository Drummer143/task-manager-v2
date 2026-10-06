import { AppShell } from '@task-manager-v2/ui-kit';
import React, { useCallback } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../shared/constants/routes';
import { Sidebar, useSidebarHotkeys } from './Sidebar';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const onInbox = useMatch(ROUTES.INBOX) !== null;

  useSidebarHotkeys(useCallback(() => navigate(ROUTES.INBOX), [navigate]));

  return (
    <AppShell
      sidebar={<Sidebar inbox={{ href: ROUTES.INBOX, current: onInbox }} />}
      header={<div>header</div>}
    >
      <Outlet />
    </AppShell>
  );
};
