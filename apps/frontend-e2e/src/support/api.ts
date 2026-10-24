import type { Page, Request, Route } from '@playwright/test';
import type {
  GetMeInWorkspaceResponse,
  MeResponse,
  WorkspaceWithRoles,
} from '@task-manager-v2/api/main/schemas';
import { DEFAULT_IDENTITY } from './authentik';
import { API_ORIGIN, APP_ORIGIN } from './env';

type Handler = (route: Route, request: Request) => Promise<void> | void;

const corsHeaders = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-headers': 'authorization, content-type, x-request-id, x-client-id',
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

/** The workspace every test is in, unless it sets up another list. */
export const WORKSPACE: WorkspaceWithRoles = {
  id: '00000000-0000-0000-0000-000000000000',
  slug: 'verso',
  name: 'Verso team',
  taskPrefix: 'VT',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  isOwner: true,
  isPersonal: true,
  roles: [],
};

/** The signed-in user in `WORKSPACE`: its owner, so every item of the workspace menu is there. */
export const defaultMeInWorkspace = (): GetMeInWorkspaceResponse => ({
  isOwner: true,
  roles: [],
  capabilities: {
    'billing.manage': true,
    'labels.create': true,
    'labels.manage': true,
    'members.invite': true,
    'members.remove': true,
    'members.view': true,
    'pages.create_root': true,
    'roles.assign': [],
    'roles.manage': true,
    'workspace.delete': false,
    'workspace.export': true,
    'workspace.settings': true,
    'workspace.transfer': false,
  },
});

/**
 * main-service. Answers are set per test with `on('GET /me', json(...))`; a call nobody set up
 * gets 501 and lands in `unhandled`, which fails the test (see fixtures.ts).
 */
export async function fakeApi(page: Page) {
  // The layout resolves the workspace of the address before any page shows
  const handlers = new Map<string, Handler>([
    ['GET /me', json(defaultMe())],
    ['GET /workspaces', json([WORKSPACE])],
    [`GET /workspaces/${WORKSPACE.id}/me`, json(defaultMeInWorkspace())],
    // The sidebar's pages tree: empty unless a test sets up pages (support/pages.ts)
    [`GET /workspaces/${WORKSPACE.id}/pages`, json([])],
  ]);
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
