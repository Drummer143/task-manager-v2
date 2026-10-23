import { AppShell, ErrorState, toast } from '@task-manager-v2/ui-kit';
import React, { useEffect } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useQuery } from '@tanstack/react-query';
import { getNotificationSummary } from '@task-manager-v2/api/main';
import { ROUTES, inboxPath } from '../../shared/constants/routes';
import { QUERY_KEYS } from '../../shared/constants/queryKeys';
import { useInboxRealtime } from '../../shared/inbox/useInboxRealtime';
import { useDataRealtime } from '../../shared/realtime/useDataRealtime';
import {
  WorkspaceProvider,
  rememberWorkspace,
  useReplaceSlug,
  useResolvedWorkspace,
  workspaceMeQuery,
  workspacesQuery,
} from '../../shared/workspaces';
import { Sidebar, useSidebarHotkeys, type SidebarUser } from './Sidebar';

/** Who is signed in, from the token: the label in the workspace menu. */
const useSignedInUser = (): SidebarUser => {
  const profile = useAuth().user?.profile;

  return {
    id: profile?.sub ?? '',
    name: profile?.name || profile?.preferred_username || profile?.email || 'Account',
    email: profile?.email,
    avatarUrl: profile?.picture,
  };
};

/**
 * The frame of a workspace's pages. It resolves the slug of the address to the workspace, puts
 * the canonical slug in the address, and renders the pages only once the workspace is known:
 * inside, everything works by its id (`useWorkspace`).
 */
export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const user = useSignedInUser();
  const { workspaceSlug = '' } = useParams();
  const onInbox = useMatch(ROUTES.INBOX) !== null;

  const resolved = useResolvedWorkspace(workspaceSlug);
  const workspace = resolved.status === 'found' ? resolved.workspace : undefined;
  const workspaceId = workspace?.id;
  const canonicalSlug = workspace?.slug;
  const missing = resolved.status === 'missing';

  const { data: workspaces = [] } = useQuery(workspacesQuery);
  const { data: summary } = useQuery({
    queryKey: QUERY_KEYS.inboxSummary,
    queryFn: ({ signal }) => getNotificationSummary({ signal }),
  });
  const { data: me } = useQuery({ ...workspaceMeQuery(workspaceId ?? ''), enabled: workspaceId !== undefined });

  const replaceSlug = useReplaceSlug();
  // An old slug, or another case: the address gets the one the workspace has now
  useEffect(() => {
    if (canonicalSlug !== undefined && canonicalSlug !== workspaceSlug) replaceSlug(canonicalSlug);
  }, [canonicalSlug, workspaceSlug, replaceSlug]);

  useEffect(() => {
    if (workspaceId !== undefined) rememberWorkspace(workspaceId);
  }, [workspaceId]);

  // Deleted, or the user was taken out of it, or never was in it: off to another one
  useEffect(() => {
    if (!missing) return;

    toast.note('This workspace isn’t available');
    navigate('/', { replace: true });
  }, [missing, navigate]);

  const inbox = inboxPath(canonicalSlug ?? workspaceSlug);
  useSidebarHotkeys(() => navigate(inbox));
  // For the whole app, not only the Inbox page: the sidebar count stays right everywhere
  useInboxRealtime();
  useDataRealtime(workspaceId);

  const openWorkspace = (id: string) => {
    const next = workspaces.find((each) => each.id === id);
    if (next) navigate(inboxPath(next.slug));
  };

  return (
    <AppShell
      sidebar={
        <Sidebar
          switcher={{
            workspace: workspace ?? null,
            // TODO(storage): `iconUrl` from `iconAssetId`, once the app knows storage's address
            workspaces: workspaces.filter((each) => !each.deletedAt),
            user,
            unreadByWorkspace: summary?.byWorkspace,
            canWorkspaceSettings: me !== undefined && (me.isOwner || me.roles.length > 0),
            canInvite: me?.capabilities['members.invite'] ?? false,
            onWorkspaceChange: openWorkspace,
            onSignOut: () => void auth.signoutRedirect(),
          }}
          inbox={{
            href: inbox,
            current: onInbox,
            unread:
              summary && workspaceId !== undefined
                ? (summary.byWorkspace[workspaceId] ?? 0) + summary.accountUnread
                : undefined,
          }}
        />
      }
      header={<div>header</div>}
    >
      {workspace ? (
        <WorkspaceProvider workspace={workspace}>
          <Outlet />
        </WorkspaceProvider>
      ) : resolved.status === 'error' ? (
        <ErrorState title="Couldn’t open this workspace" onRetry={resolved.retry} />
      ) : null}
    </AppShell>
  );
};
