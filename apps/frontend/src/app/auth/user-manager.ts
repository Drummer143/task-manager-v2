import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';
import { ROUTES } from '../../shared/constants/routes';

export const oidcSettings = (origin = window.location.origin): UserManagerSettings => ({
  authority: import.meta.env.VITE_AUTHORITY,
  client_id: import.meta.env.VITE_CLIENT_ID,
  redirect_uri: `${origin}${ROUTES.CALLBACK}`,
  post_logout_redirect_uri: `${origin}${ROUTES.LOGIN}`,
  // Authorization code with PKCE, the flow for a public client
  response_type: 'code',
  // offline_access brings a refresh token: the access token is renewed with it in the
  // background, without the hidden iframe that browsers break across sites
  scope: 'openid email profile offline_access',
  automaticSilentRenew: true,
  // The session survives reloads and new tabs. The price is that page scripts can read the
  // refresh token: no third-party scripts, strict CSP. The sign-in transaction itself stays in
  // sessionStorage (the library's default), bound to the tab it started in.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});

/**
 * The one UserManager of the app: `AuthProvider` drives it for React, and code outside React
 * (API clients, the upload worker, the callback screen) uses it directly.
 */
export const userManager = new UserManager(oidcSettings());

/**
 * The current access token, for `Authorization: Bearer`. `forceRefresh` after a server rejected
 * it (the uploader passes it). Rejects when nobody is signed in.
 */
export async function getAccessToken({ forceRefresh = false } = {}): Promise<string> {
  const user = forceRefresh ? await userManager.signinSilent() : await userManager.getUser();
  if (!user || user.expired) throw new Error('Not signed in');
  return user.access_token;
}

/** What the app keeps in the OIDC `state` across the round trip to authentik. */
export interface SigninState {
  returnTo: string;
}

/**
 * Where to go after signing in. Only paths of this app: anything that could leave the origin
 * (`https://…`, `//host`, `/\host`, which browsers read as `//host`) falls back to the start page.
 */
export function returnPathOf(state: unknown): string {
  const returnTo = (state as Partial<SigninState> | null | undefined)?.returnTo;
  return typeof returnTo === 'string' && /^\/(?![/\\])/.test(returnTo) ? returnTo : '/';
}

/** `/login?return_to=…` for `path`. */
export const loginPath = (path: string) => `${ROUTES.LOGIN}?return_to=${encodeURIComponent(path)}`;

const RETURN_TO_KEY = 'verso.auth.returnTo';
const SELECT_ACCOUNT_KEY = 'verso.auth.selectAccount';

/**
 * Leaves for authentik. `returnTo` is also kept in this tab, so the callback screen can start
 * over with it even when the sign-in transaction is lost.
 */
export async function startSignIn(returnTo: string, { selectAccount = false } = {}): Promise<void> {
  const path = returnPathOf({ returnTo });
  sessionStorage.setItem(RETURN_TO_KEY, path);
  await userManager.signinRedirect({
    state: { returnTo: path } satisfies SigninState,
    prompt: selectAccount ? 'select_account' : undefined,
  });
}

/** The page the current sign-in in this tab started from. */
export const pendingReturnTo = () => returnPathOf({ returnTo: sessionStorage.getItem(RETURN_TO_KEY) });

/**
 * Signs out of authentik and comes back to /login asking for another account; without
 * `select_account` authentik would quietly sign the same person in again. The flag travels in
 * this tab, since the sign-out return address must match a registered one exactly.
 */
export async function switchAccount(idTokenHint?: string): Promise<void> {
  sessionStorage.setItem(SELECT_ACCOUNT_KEY, '1');
  await userManager.signoutRedirect({ id_token_hint: idTokenHint });
}

/** Whether /login should ask for another account; asking clears it. */
export function takeSelectAccount(): boolean {
  const asked = sessionStorage.getItem(SELECT_ACCOUNT_KEY) === '1';
  sessionStorage.removeItem(SELECT_ACCOUNT_KEY);
  return asked;
}
