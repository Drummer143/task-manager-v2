import { status } from './support/api';
import { API_ORIGIN, APP_ORIGIN, AUTHORITY, CLIENT_ID } from './support/env';
import { expect, test } from './support/fixtures';

const SESSION_KEY = `oidc.user:${AUTHORITY}:${CLIENT_ID}`;
const OUTSIDE_THE_APP = /\/(login|auth\/callback)(\?|$)/;

test.describe('signed out', () => {
  test('signs in through authentik and comes back to the app', async ({ page, authentik, api }) => {
    const meCalled = page.waitForRequest(`${API_ORIGIN}/me`);
    await page.goto('/');
    await meCalled;

    await expect(page).not.toHaveURL(OUTSIDE_THE_APP);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).not.toBeNull();

    // Authorization code with PKCE, back to the registered callback
    expect(authentik.authorizeRequests).toHaveLength(1);
    const authorize = authentik.authorizeRequests[0].searchParams;
    expect(authorize.get('client_id')).toBe(CLIENT_ID);
    expect(authorize.get('response_type')).toBe('code');
    expect(authorize.get('code_challenge_method')).toBe('S256');
    expect(authorize.get('redirect_uri')).toBe(`${APP_ORIGIN}/auth/callback`);

    // main-service decided that this person may use the app
    const me = api.requests.filter((request) => new URL(request.url()).pathname === '/me');
    expect(me).toHaveLength(1);
    expect(await me[0].headerValue('authorization')).toBe('Bearer access-e2e-user');
  });

  test('explains a refusal of main-service and drops the session', async ({ page, api }) => {
    api.on('GET /me', status(403));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: /can.t use this Verso/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use another account' })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  });
});

test.describe('signed in', () => {
  test.use({ signedIn: true });

  test('restores the session without going to authentik', async ({ page, authentik, realtime }) => {
    await page.goto('/');

    // Realtime connects as this user: the session was read
    await expect.poll(() => realtime.connections.map((connection) => connection.token)).toEqual([
      'access-e2e-user',
    ]);
    await expect(page).not.toHaveURL(OUTSIDE_THE_APP);
    expect(authentik.authorizeRequests).toHaveLength(0);
  });
});
