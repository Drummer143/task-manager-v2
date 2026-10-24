import React, { useMemo } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useHref, useMatch, useNavigate } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import type { PageResponse, WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import { KitRoot, type RouterAdapter } from '@task-manager-v2/ui-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../shared/constants/routes';
import { WorkspaceProvider } from '../../shared/workspaces';
import { PageCrumbs } from '../../widgets/Layout/PageCrumbs';
import { PagesSection } from '../../widgets/Layout/Sidebar/PagesSection';
import { Page } from './Page';

/**
 * A page and the sidebar's tree on a fake main-service that keeps its pages: what a request
 * changes, the next fetch shows. Browser-level checks (focus across routes, drag) are in
 * apps/frontend-e2e/src/pages.spec.ts.
 */

const server = vi.hoisted(() => ({
  pages: [] as PageResponse[],
  created: 0,
  failing: new Set<string>(),
  calls: [] as unknown[][],
}));

const httpError = (status: number) =>
  new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

vi.mock('@task-manager-v2/api/main', () => {
  const live = () => server.pages.filter((each) => !each.deletedAt);
  const find = (id: string) => server.pages.find((each) => each.id === id) as PageResponse;
  const call = (name: string, ...args: unknown[]) => {
    server.calls.push([name, ...args]);
    if (server.failing.has(name)) throw httpError(500);
  };

  return {
    getPageTree: async () => live().map(({ workspaceId: _, ...node }) => node),
    getPageByShortId: async (_ws: string, shortId: string) => {
      call('getPageByShortId', shortId);
      const page = server.pages.find((each) => each.shortId === shortId);
      if (!page) throw httpError(404);
      return page;
    },
    createPage: async (ws: string, body: { type: PageResponse['type']; parentId: string | null }) => {
      call('createPage', body);
      server.created += 1;
      const made = page(`new${server.created}`, '', { workspaceId: ws, type: body.type, parentId: body.parentId });
      server.pages.push(made);
      return made;
    },
    patchPage: async (_ws: string, id: string, body: { set: Partial<PageResponse> }) => {
      call('patchPage', id, body);
      Object.assign(find(id), body.set);
    },
    movePage: async () => undefined,
    deletePage: async () => undefined,
    restorePage: async (_ws: string, id: string) => {
      call('restorePage', id);
      Object.assign(find(id), { deletedAt: null, deletedRoot: null });
      return { page: find(id), restoredToRoot: false };
    },
  };
});

const workspace = {
  id: 'ws-1',
  slug: 'verso',
  name: 'Verso team',
  taskPrefix: 'VT',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  isOwner: true,
  isPersonal: false,
  roles: [],
} as WorkspaceWithRoles;

function page(id: string, title: string, overrides: Partial<PageResponse> = {}): PageResponse {
  return {
    id,
    workspaceId: workspace.id,
    parentId: null,
    position: id,
    type: 'document',
    title,
    icon: null,
    shortId: `short${id}`,
    access: 'full',
    version: 1,
    createdAt: '2026-10-24T10:00:00Z',
    updatedAt: '2026-10-24T10:00:00Z',
    ...overrides,
  };
}

/** The layout's part of it: the tree beside, the crumbs above, the page in the middle. */
const Frame: React.FC<{ canCreateRoot: boolean }> = ({ canCreateRoot }) => {
  const navigate = useNavigate();
  const router: RouterAdapter = useMemo(() => ({ navigate, useHref }), [navigate]);
  const shortId = useMatch(ROUTES.PAGE)?.params.shortId;

  return (
    <KitRoot router={router}>
      <WorkspaceProvider workspace={workspace}>
        <PagesSection
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          canCreateRoot={canCreateRoot}
          openShortId={shortId}
        />
        {shortId && <PageCrumbs workspace={workspace} shortId={shortId} />}
        <Routes>
          <Route path="/:workspaceSlug/p/:shortId" element={<Page />} />
          <Route path="*" element={null} />
        </Routes>
      </WorkspaceProvider>
    </KitRoot>
  );
};

const open = (path: string, { canCreateRoot = true } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Frame canCreateRoot={canCreateRoot} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const title = async () => (await screen.findByRole('textbox', { name: 'Page title' })) as HTMLInputElement;
const tree = () => screen.getByRole('tree', { name: 'Pages' });
const crumbs = () => screen.getByRole('navigation', { name: 'Breadcrumbs' });

beforeEach(() => {
  server.pages = [
    page('product', 'Product', { type: 'group' }),
    page('roadmap', 'Roadmap', { parentId: 'product', icon: { kind: 'emoji', value: '🚀' } }),
    page('board', 'Q3 board', { parentId: 'product', type: 'board' }),
    page('handbook', 'Handbook'),
  ];
  server.created = 0;
  server.failing.clear();
  server.calls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a page by its address', () => {
  it('shows its icon and title, the path above it, and opens its branch in the tree', async () => {
    open('/verso/p/shortroadmap');

    expect((await title()).value).toBe('Roadmap');
    expect(screen.getByText('The editor comes here.')).toBeTruthy();
    await waitFor(() =>
      expect(within(crumbs()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Verso team',
        'Product',
        'Roadmap',
      ]),
    );
    expect(within(crumbs()).getByRole('link', { name: 'Product' }).getAttribute('href')).toBe('/verso/p/shortproduct');
    expect(within(tree()).getByRole('treeitem', { name: /Roadmap/ })).toBeTruthy();
  });

  it('a board says what will come; a group lists its children', async () => {
    const view = open('/verso/p/shortboard');
    expect(await screen.findByText('The board’s description and views come here.')).toBeTruthy();
    view.unmount();

    open('/verso/p/shortproduct');
    await title();
    await waitFor(() =>
      expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/verso/p/shortboard')).toBe(true),
    );
  });

  it('no such page: says so; a failure: offers a retry', async () => {
    const view = open('/verso/p/nothing');
    expect(await screen.findByText('This page doesn’t exist')).toBeTruthy();
    view.unmount();

    server.failing.add('getPageByShortId');
    open('/verso/p/shortroadmap');
    expect(await screen.findByText('Couldn’t open this page')).toBeTruthy();
  });

  it('in the trash: offers Restore of the page it was deleted with', async () => {
    server.pages.push(
      page('old', 'Old', { deletedAt: '2026-10-24T11:00:00Z', deletedRoot: 'old' }),
      page('child', 'Child', { parentId: 'old', deletedAt: '2026-10-24T11:00:00Z', deletedRoot: 'old' }),
    );
    open('/verso/p/shortchild');

    expect(await screen.findByText('This page is in Trash')).toBeTruthy();
    expect(screen.getByText(/deleted with a page above it/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(server.calls).toContainEqual(['restorePage', 'old']));
  });
});

describe('the title', () => {
  it('is saved trimmed on Enter, and shows in the tree and the path', async () => {
    open('/verso/p/shorthandbook');
    const field = await title();
    act(() => field.focus());

    fireEvent.change(field, { target: { value: '  Team handbook ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(server.calls).toContainEqual(['patchPage', 'handbook', { baseVersion: 1, set: { title: 'Team handbook' } }]),
    );
    expect(field.value).toBe('Team handbook');
    await waitFor(() => expect(within(tree()).getByRole('treeitem', { name: /Team handbook/ })).toBeTruthy());
  });

  it('Esc puts back the saved one; leaving it unchanged sends nothing', async () => {
    open('/verso/p/shorthandbook');
    const field = await title();
    act(() => field.focus());

    fireEvent.change(field, { target: { value: 'Draft' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field.value).toBe('Handbook');

    fireEvent.blur(field);
    expect(server.calls.some(([name]) => name === 'patchPage')).toBe(false);
  });
});

describe('making pages', () => {
  it('+ makes a document at the root and opens it with the title to type', async () => {
    open('/verso/inbox');
    await waitFor(() => expect(within(tree()).getAllByRole('treeitem')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'New page' }));

    const field = await title();
    expect(server.calls).toContainEqual(['createPage', { type: 'document', parentId: null }]);
    expect(field.value).toBe('');
    expect(document.activeElement).toBe(field);
  });

  it('+ is there but refused without pages.create_root', async () => {
    open('/verso/inbox', { canCreateRoot: false });

    const plus = screen.getByRole('button', { name: 'New page' });
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(plus);

    await act(() => Promise.resolve());
    expect(server.calls.some(([name]) => name === 'createPage')).toBe(false);
  });

  it('a group’s New page makes a child of it', async () => {
    open('/verso/p/shortproduct');
    await title();

    const buttons = screen.getAllByRole('button', { name: 'New page' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(server.calls).toContainEqual(['createPage', { type: 'document', parentId: 'product' }]));
  });

  it('a failed creation says so', async () => {
    server.failing.add('createPage');
    open('/verso/inbox');

    fireEvent.click(screen.getByRole('button', { name: 'New page' }));

    expect((await screen.findAllByText('Couldn’t create the page')).length).toBeGreaterThan(0);
  });
});
