import { Navigate, createBrowserRouter } from 'react-router-dom';
import { CallbackScreen, LoginScreen, RequireAuth } from './auth';
import { Layout } from '../widgets/Layout';
import { lazySuspense } from '../shared/utils/lazySuspense';
import { Root } from '../widgets/Root';
import { ROUTES } from '../shared/constants/routes';

const Inbox = lazySuspense(() =>
  import('../pages/Inbox').then((m) => ({ default: m.Inbox })),
);

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
            Component: Layout,
            children: [
              {
                path: ROUTES.INBOX,
                element: <Inbox />,
              },
              {
                path: '*',
                element: <Navigate to={ROUTES.INBOX} replace />,
              },
            ],
          },
        ],
      },
    ],
  },
]);
