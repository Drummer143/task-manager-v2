import type React from 'react';
import { AuthProvider } from 'react-oidc-context';
import { RouterProvider } from 'react-router-dom';
import { userManager } from './auth';
import { router } from './router';

/**
 * `AuthProvider` keeps React in step with the session (renewal, sign-out in another tab). It never
 * handles the callback itself: the callback screen does, with its own states and errors.
 */
export const App: React.FC = () => (
  <AuthProvider userManager={userManager} skipSigninCallback>
    <RouterProvider router={router} />
  </AuthProvider>
);

export default App;
