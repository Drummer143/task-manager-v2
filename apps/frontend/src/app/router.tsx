import { Navigate, createBrowserRouter } from 'react-router-dom';
import { CALLBACK_PATH, CallbackScreen, LOGIN_PATH, LoginScreen, RequireAuth } from './auth';
import { WorkspacePage } from './WorkspacePage';

/**
 * Data router (createBrowserRouter). Route location = { workspace, page };
 * everything else about the view lives in the query string (see view-state).
 * Everything except the sign-in screens sits behind RequireAuth.
 */
export const router = createBrowserRouter([
  { path: LOGIN_PATH, element: <LoginScreen /> },
  { path: CALLBACK_PATH, element: <CallbackScreen /> },
  {
    element: <RequireAuth />,
    children: [
      // Until workspaces exist, the start page is the demo board
      { index: true, element: <Navigate to="/w/product/p/board-q3" replace /> },
      { path: '/w/:workspace/p/:page', element: <WorkspacePage /> },
    ],
  },
]);
