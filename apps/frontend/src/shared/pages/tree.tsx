import type { TreeNode } from '@task-manager-v2/ui-kit';
import type { PageNodeResponse } from '@task-manager-v2/api/main/schemas';
import { pagePath } from '../constants/routes';
import { PageIcon } from './PageIcon';

/** What a page without a title is called wherever it is shown. Its title stays empty. */
export const UNTITLED = 'Untitled';

export const titleOf = (page: { title: string }) => page.title || UNTITLED;

/**
 * The kit Tree's nodes from the flat list the API gives. The order within a parent is the list's
 * (the server sorts it), so an optimistic move only has to put the page at its index.
 */
export const toTreeNodes = (pages: readonly PageNodeResponse[], workspaceSlug: string): TreeNode[] => {
  const byParent = new Map<string | null, PageNodeResponse[]>();
  for (const page of pages) {
    const parent = page.parentId ?? null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), page]);
  }

  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((page) => {
      const children = build(page.id);

      return {
        id: page.id,
        label: titleOf(page),
        icon: <PageIcon type={page.type} icon={page.icon} />,
        hasChildren: children.length > 0,
        children,
        // Any page may hold others, not only a group (pages spec §1)
        canContain: true,
        href: pagePath(workspaceSlug, page.shortId),
      };
    });

  return build(null);
};

/** The page and its ancestors, from the root down to it; empty when it is not in the list. */
export const pathTo = (pages: readonly PageNodeResponse[], pageId: string): PageNodeResponse[] => {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const path: PageNodeResponse[] = [];

  for (let page = byId.get(pageId); page; page = page.parentId ? byId.get(page.parentId) : undefined) {
    path.unshift(page);
  }

  return path;
};

/**
 * The list with `pageId` moved to `index` among the children of `parentId` (counted without it),
 * as the server will put it: the optimistic move until the tree is fetched again.
 */
export const movedIn = (
  pages: readonly PageNodeResponse[],
  pageId: string,
  parentId: string | null,
  index: number,
): PageNodeResponse[] => {
  const moved = pages.find((page) => page.id === pageId);
  if (!moved) return [...pages];

  const rest = pages.filter((page) => page.id !== pageId);
  const siblings = rest.filter((page) => (page.parentId ?? null) === parentId);
  const before = siblings[index];
  const at = before ? rest.indexOf(before) : rest.length;
  const next = [...rest];
  next.splice(at, 0, { ...moved, parentId });

  return next;
};
