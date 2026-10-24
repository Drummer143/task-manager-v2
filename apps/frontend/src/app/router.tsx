import type React from 'react';
import { Navigate, createBrowserRouter, useParams } from 'react-router-dom';
import { CallbackScreen, LoginScreen, RequireAuth } from './auth';
import { Layout } from '../widgets/Layout';
import { lazySuspense } from '../shared/utils/lazySuspense';
import { Root } from './Root';
import { ROUTES, inboxPath } from '../shared/constants/routes';
import { WorkspaceEntry } from './WorkspaceEntry';

const Inbox = lazySuspense(() =>
  import('../pages/Inbox').then((m) => ({ default: m.Inbox })),
);

const Page = lazySuspense(() => import('../pages/Page').then((m) => ({ default: m.Page })));

/**
 * To the inbox of the space in the path. An absolute path: a relative `to="inbox"` from a `*`
 * route resolves against the unmatched rest and redirects forever (`/ws/x/inbox/inbox/…`).
 */
const ToSpaceInbox: React.FC = () => {
  const { workspaceSlug = '' } = useParams();

  return <Navigate to={inboxPath(workspaceSlug)} replace />;
};

/**
 * Data router (createBrowserRouter). Route location = { workspace, page };
 * everything else about the view lives in the query string (see view-state).
 * Everything except the sign-in screens sits behind RequireAuth.
 */
export const router = createBrowserRouter([
  {
    Component: Root,
    children: [
      { path: ROUTES.LOGIN, Component: LoginScreen },
      { path: ROUTES.CALLBACK, Component: CallbackScreen },
      {
        Component: RequireAuth,
        children: [
          {
            // The layout resolves the workspace of the path: the sidebar and its links are its
            path: ROUTES.WORKSPACE,
            Component: Layout,
            children: [
              { path: 'inbox', element: <Inbox /> },
              { path: 'p/:shortId', element: <Page /> },
              // The space's own start page, and anything unknown inside it
              { index: true, Component: ToSpaceInbox },
              { path: '*', Component: ToSpaceInbox },
            ],
          },
          // No workspace in the address: the last one, or the first
          { path: '/', Component: WorkspaceEntry },
        ],
      },
    ],
  },
]);
