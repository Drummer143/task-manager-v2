import type React from 'react';
import { Navigate, createBrowserRouter, useParams } from 'react-router-dom';
import { CallbackScreen, LoginScreen, RequireAuth } from './auth';
import { Layout } from '../widgets/Layout';
import { lazySuspense } from '../shared/utils/lazySuspense';
import { Root } from './Root';
import { ROUTES, defaultWorkspaceId, inboxPath } from '../shared/constants/routes';

const Inbox = lazySuspense(() =>
  import('../pages/Inbox').then((m) => ({ default: m.Inbox })),
);

/**
 * To the inbox of the space in the path. An absolute path: a relative `to="inbox"` from a `*`
 * route resolves against the unmatched rest and redirects forever (`/ws/x/inbox/inbox/…`).
 */
const ToSpaceInbox: React.FC = () => {
  const { workspace = defaultWorkspaceId() } = useParams();

  return <Navigate to={inboxPath(workspace)} replace />;
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
            // The layout reads the space from the path: the sidebar and its links are the space's
            path: ROUTES.WORKSPACE,
            Component: Layout,
            children: [
              { path: 'inbox', element: <Inbox /> },
              // The space's own start page, and anything unknown inside it
              { index: true, Component: ToSpaceInbox },
              { path: '*', Component: ToSpaceInbox },
            ],
          },
          {
            path: '/',
            element: <Navigate to={inboxPath(defaultWorkspaceId())} replace />,
          },
        ],
      },
    ],
  },
]);
