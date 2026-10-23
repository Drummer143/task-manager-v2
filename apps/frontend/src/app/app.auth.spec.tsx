import { act, render, screen } from '@testing-library/react';
import type { AuthProviderProps } from 'react-oidc-context';
import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import { AxiosError, type AxiosResponse } from 'axios';

import { App } from './app';
import { userManager } from './auth';
import { queryClient } from './queryClient';
import { router } from './router';

const provider = vi.hoisted(() => ({ props: undefined as AuthProviderProps | undefined }));

vi.mock('react-oidc-context', () => ({
  AuthProvider: (props: AuthProviderProps) => {
    provider.props = props;
    return props.children;
  },
  // Signed in: the protected routes render
  useAuth: () => ({ isLoading: false, isAuthenticated: true, user: null }),
}));

const workspace = (id: string, slug: string, name: string): WorkspaceWithRoles => ({
  id,
  slug,
  name,
  taskPrefix: 'VT',
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  isOwner: true,
  isPersonal: false,
  roles: [],
});

const server = vi.hoisted(() => ({
  workspaces: [] as WorkspaceWithRoles[],
  /** What `resolveSlug` answers for a slug the list does not know; else 404. */
  aliases: {} as Record<string, { id: string; slug: string }>,
}));

const notFound = () =>
  new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404 } as AxiosResponse);

vi.mock('@task-manager-v2/api/main', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@task-manager-v2/api/main')>()),
  getUserWorkspaces: async () => server.workspaces,
  resolveSlug: async ({ slug }: { slug: string }) => {
    const found = server.aliases[slug];
    if (!found) throw notFound();
    return found;
  },
  getNotificationSummary: async () => ({ byWorkspace: {}, accountUnread: 0 }),
  getMeInWorkspace: async () => ({ isOwner: true, roles: [], capabilities: {} }),
  listNotifications: async () => ({ data: [] }),
  listPinnedAccountNotifications: async () => ({ data: [] }),
}));

const path = () => router.state.location.pathname + router.state.location.search;

const go = async (to: string) => {
  render(<App />);
  await act(() => router.navigate(to));
};

beforeEach(() => {
  server.workspaces = [workspace('w1', 'verso', 'Verso team'), workspace('w2', 'side', 'Side project')];
  server.aliases = {};
});

afterEach(() => {
  queryClient.clear();
  localStorage.clear();
});

describe('App', () => {
  it('drives the app UserManager and leaves the callback to the callback screen', () => {
    render(<App />);

    expect(provider.props?.userManager).toBe(userManager);
    expect(provider.props?.skipSigninCallback).toBe(true);
  });

  it("starts at the first workspace's inbox", async () => {
    await go('/');

    await vi.waitFor(() => expect(path()).toBe('/verso/inbox'));
  });

  it('starts at the workspace the user was in last, while they still are', async () => {
    await go('/side/inbox');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Side project, workspace menu' })).toBeTruthy());

    await act(() => router.navigate('/'));
    await vi.waitFor(() => expect(path()).toBe('/side/inbox'));

    // Gone from their list since: the first one
    server.workspaces = server.workspaces.slice(0, 1);
    queryClient.clear();
    await act(() => router.navigate('/'));
    await vi.waitFor(() => expect(path()).toBe('/verso/inbox'));
  });

  it("sends an unknown path inside a workspace to that workspace's inbox", async () => {
    await go('/verso/nowhere');

    await vi.waitFor(() => expect(path()).toBe('/verso/inbox'));
  });

  it('puts the current slug in place of an old one, and keeps the rest of the address', async () => {
    server.aliases['side-old'] = { id: 'w2', slug: 'side' };

    await go('/side-old/inbox?view=unread');

    await vi.waitFor(() => expect(path()).toBe('/side/inbox?view=unread'));
  });

  it('leaves a workspace the user is not in for another one', async () => {
    await go('/elsewhere/inbox');

    await vi.waitFor(() => expect(path()).toBe('/verso/inbox'));
  });

  it('says so when the user is in no workspace', async () => {
    server.workspaces = [];

    await go('/');

    await vi.waitFor(() => expect(screen.getByText('You’re not in any workspace yet')).toBeTruthy());
  });
});
