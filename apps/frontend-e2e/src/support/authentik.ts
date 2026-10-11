import type { Page, Route } from '@playwright/test';
import { APP_ORIGIN, AUTHORITY, CLIENT_ID } from './env';

export interface FakeIdentity {
  sub: string;
  email: string;
  name: string;
}

export const DEFAULT_IDENTITY: FakeIdentity = {
  sub: 'e2e-user',
  email: 'e2e-user@verso.test',
  name: 'E2E User',
};

const TOKEN_LIFETIME_S = 3600;

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** oidc-client-ts reads the claims of an id token, it does not check the signature. */
const idToken = (identity: FakeIdentity, nonce?: string) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: AUTHORITY,
    aud: CLIENT_ID,
    iat: now,
    exp: now + TOKEN_LIFETIME_S,
    ...identity,
    ...(nonce && { nonce }),
  };
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(claims)}.signature`;
};

/** Cross-origin answers: the app calls authentik with fetch from another origin. */
const corsHeaders = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(body) });

/**
 * authentik as far as the app sees it: discovery, an authorize endpoint that signs `identity`
 * in at once and sends the browser back with a code, the token endpoint, and sign-out.
 * The access token is `access-<sub>`, so tests can tell whose token reached a service.
 */
export async function fakeAuthentik(page: Page, identity: FakeIdentity = DEFAULT_IDENTITY) {
  const authorizeRequests: URL[] = [];
  const endpoint = (path: string) => new URL(path, AUTHORITY).href;
  const nonces = new Map<string, string>();

  await page.route(`${AUTHORITY}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });

    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return fulfillJson(route, {
        issuer: AUTHORITY,
        authorization_endpoint: endpoint('authorize/'),
        token_endpoint: endpoint('token/'),
        userinfo_endpoint: endpoint('userinfo/'),
        end_session_endpoint: endpoint('end-session/'),
        jwks_uri: endpoint('jwks/'),
      });
    }

    if (url.pathname.endsWith('/authorize/')) {
      authorizeRequests.push(url);
      const code = `code-${authorizeRequests.length}`;
      const nonce = url.searchParams.get('nonce');
      if (nonce) nonces.set(code, nonce);
      const back = new URL(url.searchParams.get('redirect_uri') ?? `${APP_ORIGIN}/`);
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      return route.fulfill({ status: 302, headers: { location: back.href } });
    }

    if (url.pathname.endsWith('/token/')) {
      const code = new URLSearchParams(request.postData() ?? '').get('code') ?? '';
      return fulfillJson(route, {
        access_token: `access-${identity.sub}`,
        refresh_token: `refresh-${identity.sub}`,
        id_token: idToken(identity, nonces.get(code)),
        token_type: 'Bearer',
        expires_in: TOKEN_LIFETIME_S,
        scope: 'openid email profile offline_access',
      });
    }

    if (url.pathname.endsWith('/end-session/')) {
      const back = url.searchParams.get('post_logout_redirect_uri') ?? `${APP_ORIGIN}/`;
      return route.fulfill({ status: 302, headers: { location: back } });
    }

    return route.fulfill({ status: 404, headers: corsHeaders });
  });

  return { authorizeRequests };
}

/**
 * A session left by an earlier sign-in, as oidc-client-ts keeps it (localStorage, see
 * apps/frontend/src/app/auth/user-manager.ts). Put before the first navigation.
 */
export async function restoreSession(page: Page, identity: FakeIdentity = DEFAULT_IDENTITY) {
  const user = {
    id_token: idToken(identity),
    access_token: `access-${identity.sub}`,
    refresh_token: `refresh-${identity.sub}`,
    token_type: 'Bearer',
    scope: 'openid email profile offline_access',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, ...identity },
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_S,
  };
  await page.addInitScript(
    ([key, value]) => {
      // Only into a fresh page: a sign-out during the test must stick across reloads
      if (!sessionStorage.getItem('e2e.seeded')) {
        sessionStorage.setItem('e2e.seeded', '1');
        localStorage.setItem(key, value);
      }
    },
    [`oidc.user:${AUTHORITY}:${CLIENT_ID}`, JSON.stringify(user)] as const,
  );
}
