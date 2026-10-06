/**
 * The page authentik returns to (design: Callback). In the good case it is barely seen: a moment
 * of empty background, then the page the person was going to.
 *
 *   code + state → token exchange (oidc-client-ts) → GET /me → location.replace(returnTo)
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { Button, Spinner, raw } from '@task-manager-v2/ui-kit';

import { type AuthError, AuthTimeout, callbackError, meError } from './auth-errors';
import { AuthErrorView } from './AuthErrorView';
import { AuthFrame, AuthStatus, AuthText, Wordmark } from './AuthScreen';
import { fetchMe } from './me';
import {
  pendingReturnTo,
  returnPathOf,
  startSignIn,
  switchAccount,
  userManager,
} from './user-manager';
import { ROUTES } from '../../shared/constants/routes';

/** Timeline of the wait (design: Callback §01). The spinner appears after --spinner-delay. */
export const HINT_AFTER_MS = 1_000;
export const SLOW_AFTER_MS = 4_000;
export const TIMEOUT_MS = 15_000;
/** `GET /me` failing on the server side is retried after these pauses before it is shown. */
export const ME_RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
/** How long authentik keeps an authorization code; waiting for the network longer needs a new one. */
export const CODE_LIFETIME_MS = 60_000;
/** One quiet new sign-in per tab in this window, so a broken sign-in cannot loop. */
export const SILENT_RETRY_WINDOW_MS = 5 * 60_000;
const SILENT_RETRY_KEY = 'verso.auth.silentRetryAt';

export interface CallbackDeps {
  completeSignIn: (url: string) => Promise<User>;
  getUser: () => Promise<User | null>;
  removeUser: () => Promise<void>;
  fetchMe: typeof fetchMe;
  startSignIn: (returnTo: string) => Promise<void>;
  switchAccount: (idTokenHint?: string) => Promise<void>;
  leave: (path: string) => void;
  isOnline: () => boolean;
}

const defaultDeps: CallbackDeps = {
  completeSignIn: (url) => userManager.signinRedirectCallback(url),
  getUser: () => userManager.getUser(),
  removeUser: () => userManager.removeUser(),
  fetchMe,
  startSignIn: (returnTo) => startSignIn(returnTo),
  switchAccount,
  // replace: the callback must not stay in the history ("Back" would replay a used code)
  leave: (path) => window.location.replace(path),
  isOnline: () => navigator.onLine,
};

type Stage = 'blank' | 'spinner' | 'hint' | 'slow';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitOnline = () =>
  new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));

const withDeadline = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, sleep(ms).then(() => Promise.reject(new AuthTimeout()))]);

/** Short id shown as `req …` and sent to the server as `X-Request-Id`. */
const newRequestId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

const hasAuthParams = (url: string) => {
  const params = new URL(url).searchParams;
  return params.has('state') && (params.has('code') || params.has('error'));
};

function takeSilentRetry(now = Date.now()): boolean {
  const last = Number(sessionStorage.getItem(SILENT_RETRY_KEY) ?? 0);
  if (now - last < SILENT_RETRY_WINDOW_MS) return false;
  sessionStorage.setItem(SILENT_RETRY_KEY, String(now));
  return true;
}

export interface CallbackScreenProps {
  /** Replaces the real sign-in, network and navigation; for tests. */
  deps?: Partial<CallbackDeps>;
}

export const CallbackScreen: React.FC<CallbackScreenProps> = ({ deps: overrides }) => {
  const deps = useMemo(() => ({ ...defaultDeps, ...overrides }), [overrides]);
  const requestId = useMemo(newRequestId, []);
  const [stage, setStage] = useState<Stage>('blank');
  const [error, setError] = useState<AuthError | null>(null);

  const started = useRef(false);
  /** Bumped by "Start over": results of an abandoned attempt are ignored. */
  const attempt = useRef(0);
  const loadedAt = useRef(Date.now());
  const spinnerShownAt = useRef<number | null>(null);
  const returnTo = useRef(pendingReturnTo());
  const signedIn = useRef<User | null>(null);
  /** Kept for "Use another account" after the session itself was dropped. */
  const idTokenHint = useRef<string | undefined>(undefined);

  // The wait's timeline; restarted whenever the screen goes back to waiting
  useEffect(() => {
    if (error) return;
    document.title = 'Signing in… · Verso';
    setStage('blank');
    spinnerShownAt.current = null;
    const timers = [
      setTimeout(() => {
        spinnerShownAt.current = Date.now();
        setStage('spinner');
      }, raw['spinner-delay']),
      setTimeout(() => setStage('hint'), HINT_AFTER_MS),
      setTimeout(() => setStage('slow'), SLOW_AFTER_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [error]);

  /** Goes on to the app, keeping a spinner that did appear for its minimum time (no flash). */
  const leave = useCallback(
    async (path: string) => {
      const shownFor = spinnerShownAt.current === null ? Infinity : Date.now() - spinnerShownAt.current;
      if (shownFor < raw['spinner-min']) await sleep(raw['spinner-min'] - shownFor);
      deps.leave(path);
    },
    [deps],
  );

  /** A new sign-in. Leaving for authentik can itself fail (unreachable, not configured). */
  const restart = useCallback(() => {
    attempt.current++;
    deps.startSignIn(returnTo.current).catch((cause: unknown) => setError(callbackError(cause, deps.isOnline())));
  }, [deps]);

  const loadMe = useCallback(
    async (user: User, current: number) => {
      for (let retry = 0; ; retry++) {
        try {
          await deps.fetchMe(user.access_token, requestId, AbortSignal.timeout(TIMEOUT_MS));
          break;
        } catch (cause) {
          if (current !== attempt.current) return;
          const failure = meError(cause, user.profile.email, deps.isOnline());
          // No action is offered while offline, so nothing can replace this attempt meanwhile
          if (failure.code === 'auth.offline') {
            setError(failure);
            await waitOnline();
            setError(null);
            continue;
          }
          if (failure.code === 'auth.api_unavailable' && retry < ME_RETRY_DELAYS_MS.length) {
            await sleep(ME_RETRY_DELAYS_MS[retry]);
            if (current !== attempt.current) return;
            continue;
          }
          if (failure.code === 'auth.not_allowed' || failure.code === 'auth.token_failed') {
            // Signed in at authentik, but not into this app: drop the tokens
            idTokenHint.current = user.id_token;
            await deps.removeUser();
          }
          setError(failure);
          return;
        }
      }
      if (current === attempt.current) await leave(returnPathOf(user.state));
    },
    [deps, leave, requestId],
  );

  const complete = useCallback(
    async (url: string) => {
      const current = ++attempt.current;

      if (!deps.isOnline()) {
        setError({ code: 'auth.offline' });
        await waitOnline();
        // The code may have expired meanwhile
        if (Date.now() - loadedAt.current > CODE_LIFETIME_MS) return restart();
        setError(null);
      }

      let user: User;
      try {
        if (!hasAuthParams(url)) throw new Error('No matching state found in storage');
        user = await withDeadline(deps.completeSignIn(url), TIMEOUT_MS);
      } catch (cause) {
        if (current !== attempt.current) return;
        const failure = callbackError(cause, deps.isOnline());

        if (failure.code === 'auth.state_mismatch') {
          // An old callback (Back, a second tab) while the session is alive: just go on
          const existing = await deps.getUser();
          if (existing && !existing.expired) return leave(returnTo.current);
        }
        if (failure.silentRetry && takeSilentRetry()) return restart();
        if (failure.code === 'auth.offline') {
          setError(failure);
          await waitOnline();
          setError(null);
          return Date.now() - loadedAt.current > CODE_LIFETIME_MS ? restart() : void complete(url);
        }
        setError(failure);
        return;
      }

      if (current !== attempt.current) return;
      returnTo.current = returnPathOf(user.state);
      signedIn.current = user;
      await loadMe(user, current);
    },
    [deps, leave, loadMe, restart],
  );

  useEffect(() => {
    // Effects run twice in StrictMode; a code can be exchanged only once
    if (started.current) return;
    started.current = true;
    const url = window.location.href;
    // Out of the address bar before anything else: not in history, logs or copied links
    window.history.replaceState(null, '', ROUTES.CALLBACK);
    void complete(url);
  }, [complete]);

  const onAction = useCallback(() => {
    if (!error) return;
    switch (error.code) {
      case 'auth.not_allowed':
        deps
          .switchAccount(idTokenHint.current)
          .catch((cause: unknown) => setError(callbackError(cause, deps.isOnline())));
        return;
      case 'auth.api_unavailable':
        // Signed in at authentik already: only /me is asked again
        setError(null);
        void loadMe(signedIn.current as User, ++attempt.current);
        return;
      default:
        restart();
    }
  }, [deps, error, loadMe, restart]);

  if (error) return <AuthErrorView error={error} requestId={requestId} onAction={onAction} />;

  if (stage === 'blank') return <AuthFrame role="status" />;

  return (
    <AuthFrame centered fade role="status">
      <Wordmark />
      <AuthStatus>
        <Spinner size="md" aria-hidden />
        {stage !== 'spinner' && 'Signing you in…'}
      </AuthStatus>
      {stage === 'slow' && (
        <>
          <AuthText>This is taking longer than usual.</AuthText>
          <Button variant="ghost" size="sm" onClick={restart}>
            Start over
          </Button>
        </>
      )}
    </AuthFrame>
  );
};

export default CallbackScreen;
