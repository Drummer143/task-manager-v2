import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PageNodeResponse } from '@task-manager-v2/api/main/schemas';
import { toast, undoHistory } from '@task-manager-v2/ui-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUERY_KEYS } from '../constants/queryKeys';
import { movedIn, pathTo, titleOf, toTreeNodes } from './tree';
import { usePageActions } from './usePageActions';

const server = vi.hoisted(() => ({
  failing: new Set<string>(),
  restoredToRoot: false,
  calls: [] as unknown[][],
}));

vi.mock('@task-manager-v2/api/main', () => {
  const answer =
    (name: string, value: unknown = undefined) =>
    async (...args: unknown[]) => {
      server.calls.push([name, ...args]);
      if (server.failing.has(name)) throw new Error(`${name} failed`);
      return value;
    };

  return {
    createPage: answer('createPage', { id: 'new', shortId: 'shortnew01' }),
    patchPage: answer('patchPage'),
    movePage: answer('movePage'),
    deletePage: answer('deletePage'),
    restorePage: async (...args: unknown[]) => {
      server.calls.push(['restorePage', ...args]);
      return { page: {}, restoredToRoot: server.restoredToRoot };
    },
  };
});

const WS = 'ws-1';

const node = (id: string, title: string, parentId: string | null = null): PageNodeResponse => ({
  id,
  parentId,
  position: id,
  type: 'document',
  title,
  icon: null,
  shortId: `short-${id}`,
  access: 'full',
  version: 1,
});

const PAGES = [
  node('product', 'Product'),
  node('handbook', ''),
  node('roadmap', 'Roadmap', 'product'),
  node('q3', 'Q3', 'roadmap'),
  node('notes', 'Notes', 'product'),
];

describe('the tree of the flat list', () => {
  it('nests children under their parents in the list’s order, with links and "Untitled"', () => {
    const nodes = toTreeNodes(PAGES, 'verso');

    expect(nodes.map((each) => each.label)).toEqual(['Product', 'Untitled']);
    expect(nodes[0].children?.map((each) => each.label)).toEqual(['Roadmap', 'Notes']);
    expect(nodes[0].hasChildren).toBe(true);
    expect(nodes[1].hasChildren).toBe(false);
    expect(nodes[0].href).toBe('/verso/p/short-product');
    expect(nodes[0].canContain).toBe(true);
  });

  it('gives the path from the root down to a page', () => {
    expect(pathTo(PAGES, 'q3').map(titleOf)).toEqual(['Product', 'Roadmap', 'Q3']);
    expect(pathTo(PAGES, 'missing')).toEqual([]);
  });

  it('moves a page to an index counted without it, or last', () => {
    const order = (pages: PageNodeResponse[], parentId: string | null) =>
      pages.filter((each) => each.parentId === parentId).map((each) => each.id);

    expect(order(movedIn(PAGES, 'notes', 'product', 0), 'product')).toEqual(['notes', 'roadmap']);
    expect(order(movedIn(PAGES, 'handbook', 'product', 9), 'product')).toEqual([
      'roadmap',
      'notes',
      'handbook',
    ]);
    expect(movedIn(PAGES, 'missing', null, 0)).toEqual(PAGES);
  });
});

describe('usePageActions', () => {
  let client: QueryClient;

  const setUp = () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(QUERY_KEYS.pageTree(WS), PAGES);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    return renderHook(() => usePageActions(WS), { wrapper }).result.current;
  };

  const tree = () => client.getQueryData<PageNodeResponse[]>(QUERY_KEYS.pageTree(WS)) ?? [];

  beforeEach(() => {
    server.failing.clear();
    server.calls = [];
    server.restoredToRoot = false;
    vi.spyOn(toast, 'error');
    vi.spyOn(toast, 'note');
    vi.spyOn(toast, 'undo');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renames at once, with the version the tree has', async () => {
    const actions = setUp();

    const done = actions.rename('roadmap', 'Plan');
    expect(tree().find((each) => each.id === 'roadmap')?.title).toBe('Plan');
    await done;

    expect(server.calls).toContainEqual(['patchPage', WS, 'roadmap', { baseVersion: 1, set: { title: 'Plan' } }]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says so when a rename or a move fails', async () => {
    const actions = setUp();
    server.failing.add('patchPage').add('movePage');

    await actions.rename('roadmap', 'Plan');
    await actions.move('notes', null, 0);

    expect(toast.error).toHaveBeenCalledWith({ message: 'Couldn’t rename “Roadmap”' });
    expect(toast.error).toHaveBeenCalledWith({ message: 'Couldn’t move “Notes”' });
  });

  it('moves at once to the place the tree points at', async () => {
    const actions = setUp();

    const done = actions.move('notes', null, 0);
    expect(tree()[0]).toMatchObject({ id: 'notes', parentId: null });
    await done;

    expect(server.calls).toContainEqual(['movePage', WS, 'notes', { parentId: null, index: 0 }]);
  });

  it('ignores a page the tree does not have', async () => {
    const actions = setUp();

    await actions.rename('missing', 'X');
    await actions.move('missing', null, 0);
    await actions.remove('missing');

    expect(server.calls).toEqual([]);
  });

  it('deletes a page with its subtree from the tree, and Undo restores it', async () => {
    const actions = setUp();

    await act(() => actions.remove('roadmap'));

    expect(tree().map((each) => each.id)).toEqual(['product', 'handbook', 'notes']);
    expect(toast.undo).toHaveBeenCalledWith(expect.objectContaining({ message: 'Moved “Roadmap” to Trash' }));

    await act(() => undoHistory.undo());
    await waitFor(() => expect(server.calls).toContainEqual(['restorePage', WS, 'roadmap']));
  });

  it('puts the tree back and says so when a delete fails', async () => {
    const actions = setUp();
    server.failing.add('deletePage');

    await act(() => actions.remove('roadmap'));

    expect(toast.error).toHaveBeenCalledWith({ message: 'Couldn’t delete “Roadmap”' });
    expect(toast.undo).not.toHaveBeenCalled();
  });

  it('creates a page and tells when a restore went to the root', async () => {
    const actions = setUp();
    server.restoredToRoot = true;

    await expect(actions.create('board', 'product')).resolves.toMatchObject({ id: 'new' });
    expect(server.calls).toContainEqual(['createPage', WS, { type: 'board', parentId: 'product' }]);

    await actions.restore('roadmap');
    expect(toast.note).toHaveBeenCalledWith('Restored to the top level');
  });
});
