import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { type AuthError, callbackError } from './auth-errors';
import { AuthErrorView } from './AuthErrorView';
import { AuthFrame } from './AuthScreen';
import { returnPathOf, startSignIn, takeSelectAccount, userManager } from './user-manager';

/**
 * `/login?return_to=/path`: hands the browser to authentik. Also where authentik returns after
 * sign-out; "Use another account" arrives here asking to choose an account.
 */
export const LoginScreen: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = useMemo(() => returnPathOf({ returnTo: params.get('return_to') }), [params]);
  const [error, setError] = useState<AuthError | null>(null);
  const requestId = useMemo(() => crypto.randomUUID().replace(/-/g, '').slice(0, 8), []);
  const started = useRef(false);

  const signIn = useCallback(
    (selectAccount: boolean) => {
      setError(null);
      // authentik unreachable or misconfigured: its discovery document cannot be read
      startSignIn(returnTo, { selectAccount }).catch((cause: unknown) => setError(callbackError(cause)));
    },
    [returnTo],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const selectAccount = takeSelectAccount();
    void (async () => {
      const user = selectAccount ? null : await userManager.getUser();
      // Already signed in: nothing to do here
      if (user && !user.expired) navigate(returnTo, { replace: true });
      else signIn(selectAccount);
    })();
  }, [navigate, returnTo, signIn]);

  if (error) return <AuthErrorView error={error} requestId={requestId} onAction={() => signIn(false)} />;
  return <AuthFrame role="status" />;
};

export default LoginScreen;
