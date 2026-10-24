import { queryOptions } from '@tanstack/react-query';
import { getPageByShortId, getPageTree } from '@task-manager-v2/api/main';
import { QUERY_KEYS } from '../constants/queryKeys';
import { tag } from '../realtime/tags';

/** Every page of the workspace the user sees, flat, each parent's children in their order. */
export const pageTreeQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: QUERY_KEYS.pageTree(workspaceId),
    queryFn: ({ signal }) => getPageTree(workspaceId, { signal }),
    meta: { tags: [tag.tree(workspaceId)], workspaceId },
  });

/**
 * A page by its address, live or in the trash. Every change of a page that a page shows is a
 * change of the tree too (title, icon, type, place), so it goes stale with the tree. `404`: no
 * such page here.
 */
export const pageByShortIdQuery = (workspaceId: string, shortId: string) =>
  queryOptions({
    queryKey: QUERY_KEYS.pageByShortId(workspaceId, shortId),
    queryFn: ({ signal }) => getPageByShortId(workspaceId, shortId, { signal }),
    meta: { tags: [tag.tree(workspaceId)], workspaceId },
    retry: false,
  });
