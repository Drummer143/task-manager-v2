import type React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import { AuthFrame } from './AuthScreen';
import { loginPath } from './user-manager';

/**
 * Layout route for everything behind sign-in. Without a valid session it goes to /login,
 * remembering the page to come back to.
 */
export const RequireAuth: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  // Restoring the session from storage takes a moment; show the empty background meanwhile
  if (auth.isLoading) return <AuthFrame role="status" />;

  if (!auth.isAuthenticated) {
    return <Navigate to={loginPath(location.pathname + location.search + location.hash)} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
