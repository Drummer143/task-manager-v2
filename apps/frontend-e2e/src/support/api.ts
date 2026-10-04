import type { Page, Request, Route } from '@playwright/test';
import type { MeResponse } from '@task-manager-v2/api/main/schemas';
import { DEFAULT_IDENTITY } from './authentik';
import { API_ORIGIN, APP_ORIGIN } from './env';

type Handler = (route: Route, request: Request) => Promise<void> | void;

const corsHeaders = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-headers': 'authorization, content-type, x-request-id',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export const json = (body: unknown, status = 200): Handler => (route) =>
  route.fulfill({ status, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(body) });

export const status = (code: number): Handler => (route) => route.fulfill({ status: code, headers: corsHeaders });

export const defaultMe = (): MeResponse => ({
  user: {
    id: DEFAULT_IDENTITY.sub,
    username: DEFAULT_IDENTITY.name,
    email: DEFAULT_IDENTITY.email,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  workspaces: [],
  pendingInvites: [],
});

/**
 * main-service. Answers are set per test with `on('GET /me', json(...))`; a call nobody set up
 * gets 501 and lands in `unhandled`, which fails the test (see fixtures.ts).
 */
export async function fakeApi(page: Page) {
  const handlers = new Map<string, Handler>([['GET /me', json(defaultMe())]]);
  const requests: Request[] = [];
  const unhandled: string[] = [];

  await page.route(`${API_ORIGIN}/**`, async (route, request) => {
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });

    const key = `${request.method()} ${new URL(request.url()).pathname}`;
    requests.push(request);
    const handler = handlers.get(key);
    if (handler) return handler(route, request);

    unhandled.push(key);
    return route.fulfill({ status: 501, headers: corsHeaders });
  });

  return {
    /** `'GET /notifications'` → how to answer it from now on. */
    on: (key: string, handler: Handler) => void handlers.set(key, handler),
    requests,
    unhandled,
  };
}

export type FakeApi = Awaited<ReturnType<typeof fakeApi>>;
