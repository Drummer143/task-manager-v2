import type { User } from 'oidc-client-ts';

import {
  getAccessToken,
  loginPath,
  oidcSettings,
  pendingReturnTo,
  returnPathOf,
  startSignIn,
  switchAccount,
  takeSelectAccount,
  userManager,
} from './user-manager';

const user = (accessToken: string, expired = false) => ({ access_token: accessToken, expired }) as User;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('oidcSettings', () => {
  it('follows the design: callback and login on this origin, refresh token, session in localStorage', () => {
    vi.stubEnv('VITE_AUTHORITY', 'https://auth.example.test/application/o/task-manager/');
    vi.stubEnv('VITE_CLIENT_ID', 'client-1');

    const settings = oidcSettings('https://localhost:1346');

    expect(settings).toMatchObject({
      authority: 'https://auth.example.test/application/o/task-manager/',
      client_id: 'client-1',
      redirect_uri: 'https://localhost:1346/auth/callback',
      post_logout_redirect_uri: 'https://localhost:1346/login',
      response_type: 'code',
      automaticSilentRenew: true,
    });
    expect(settings.scope?.split(' ')).toContain('offline_access');
  });
});

describe('returnPathOf', () => {
  it('returns paths of this app and never leaves the origin', () => {
    expect(returnPathOf({ returnTo: '/w/product/p/board?view=table#top' })).toBe('/w/product/p/board?view=table#top');
    for (const returnTo of ['https://evil.test/', '//evil.test', '/\\evil.test', 'w/relative', 42, null]) {
      expect(returnPathOf({ returnTo })).toBe('/');
    }
    expect(returnPathOf(undefined)).toBe('/');
  });
});

describe('getAccessToken', () => {
  it('reads the stored session, or renews it when asked to', async () => {
    vi.spyOn(userManager, 'getUser').mockResolvedValue(user('stored'));
    vi.spyOn(userManager, 'signinSilent').mockResolvedValue(user('renewed'));

    await expect(getAccessToken()).resolves.toBe('stored');
    await expect(getAccessToken({ forceRefresh: true })).resolves.toBe('renewed');
  });

  it('rejects without a valid session', async () => {
    vi.spyOn(userManager, 'getUser').mockResolvedValueOnce(null).mockResolvedValueOnce(user('old', true));

    await expect(getAccessToken()).rejects.toThrow('Not signed in');
    await expect(getAccessToken()).rejects.toThrow('Not signed in');
  });
});

describe('signing in and out', () => {
  it('builds the /login address', () => {
    expect(loginPath('/w/a/p/b?view=table')).toBe('/login?return_to=%2Fw%2Fa%2Fp%2Fb%3Fview%3Dtable');
  });

  it('remembers where sign-in started, in the state and in this tab', async () => {
    const signinRedirect = vi.spyOn(userManager, 'signinRedirect').mockResolvedValue(undefined);

    await startSignIn('/w/a/p/b', { selectAccount: true });

    expect(signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/w/a/p/b' }, prompt: 'select_account' });
    expect(pendingReturnTo()).toBe('/w/a/p/b');
  });

  it('asks /login for another account once after switching', async () => {
    const signoutRedirect = vi.spyOn(userManager, 'signoutRedirect').mockResolvedValue(undefined);

    await switchAccount('id-token');

    expect(signoutRedirect).toHaveBeenCalledWith({ id_token_hint: 'id-token' });
    expect(takeSelectAccount()).toBe(true);
    expect(takeSelectAccount()).toBe(false);
  });
});
