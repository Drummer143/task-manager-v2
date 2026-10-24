import { useQueryClient } from '@tanstack/react-query';
import { createPage, deletePage, movePage, patchPage, restorePage } from '@task-manager-v2/api/main';
import type { PageNodeResponse, PageType } from '@task-manager-v2/api/main/schemas';
import { UNDO_GLOBAL_SCOPE, toast, undoHistory } from '@task-manager-v2/ui-kit';
import { QUERY_KEYS } from '../constants/queryKeys';
import { movedIn, titleOf } from './tree';

/** The page and every page under it, as the server trashes them together. */
const subtreeOf = (pages: readonly PageNodeResponse[], pageId: string) => {
  const ids = new Set([pageId]);
  let size = 0;

  while (size !== ids.size) {
    size = ids.size;
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId)) ids.add(page.id);
    }
  }

  return ids;
};

/**
 * What can be done to a workspace's pages, each applied to the cached tree at once and checked
 * by the server after: the tree is fetched again either way, and a failure is told in a toast.
 */
export const usePageActions = (workspaceId: string) => {
  const queryClient = useQueryClient();
  const treeKey = QUERY_KEYS.pageTree(workspaceId);

  const tree = () => queryClient.getQueryData<PageNodeResponse[]>(treeKey) ?? [];
  const setTree = (update: (pages: PageNodeResponse[]) => PageNodeResponse[]) =>
    queryClient.setQueryData<PageNodeResponse[]>(treeKey, (pages) => pages && update(pages));
  // The tree and the open page: everything of pages in this workspace
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });

  const settle = async (work: Promise<unknown>, failure: string) => {
    try {
      await work;
    } catch {
      toast.error({ message: failure });
    } finally {
      void refresh();
    }
  };

  /** A new empty page, last under `parentId` (the root when `null`). Rejects when refused. */
  const create = async (type: PageType, parentId: string | null) => {
    const page = await createPage(workspaceId, { type, parentId });
    await refresh();

    return page;
  };

  const rename = (pageId: string, title: string) => {
    const page = tree().find((each) => each.id === pageId);
    if (!page) return Promise.resolve();

    setTree((pages) => pages.map((each) => (each.id === pageId ? { ...each, title } : each)));

    return settle(
      patchPage(workspaceId, pageId, { baseVersion: page.version, set: { title } }),
      `Couldn’t rename “${titleOf(page)}”`,
    );
  };

  /** `index`: among the new siblings, counted without the page (the kit Tree's `onMove`). */
  const move = (pageId: string, parentId: string | null, index: number) => {
    const page = tree().find((each) => each.id === pageId);
    if (!page) return Promise.resolve();

    setTree((pages) => movedIn(pages, pageId, parentId, index));

    return settle(movePage(workspaceId, pageId, { parentId, index }), `Couldn’t move “${titleOf(page)}”`);
  };

  const restore = async (pageId: string) => {
    const restored = await restorePage(workspaceId, pageId);
    await refresh();
    if (restored.restoredToRoot) toast.note('Restored to the top level');

    return restored;
  };

  /** To the trash with everything under it, and Undo. */
  const remove = async (pageId: string) => {
    const page = tree().find((each) => each.id === pageId);
    if (!page) return;

    const gone = subtreeOf(tree(), pageId);
    setTree((pages) => pages.filter((each) => !gone.has(each.id)));

    try {
      await deletePage(workspaceId, pageId);
    } catch {
      toast.error({ message: `Couldn’t delete “${titleOf(page)}”` });
      void refresh();
      return;
    }

    void refresh();

    const message = `Moved “${titleOf(page)}” to Trash`;
    const op = undoHistory.push({
      label: `Delete “${titleOf(page)}”`,
      undo: async () => {
        await restore(pageId);
      },
      redo: async () => {
        await deletePage(workspaceId, pageId);
        await refresh();
      },
      // The tree is seen everywhere, not only on the page it was deleted from
      scope: UNDO_GLOBAL_SCOPE,
    });
    toast.undo({ message, op });
  };

  return { create, rename, move, remove, restore };
};
