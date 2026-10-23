import { queryOptions } from '@tanstack/react-query';
import { getMeInWorkspace, getUserWorkspaces, resolveSlug } from '@task-manager-v2/api/main';
import { QUERY_KEYS } from '../constants/queryKeys';
import { tag } from '../realtime/tags';

/** The user's workspaces: the switcher, and the slug → id of every one of them. */
export const workspacesQuery = queryOptions({
  queryKey: QUERY_KEYS.workspaces,
  queryFn: ({ signal }) => getUserWorkspaces({ signal }),
  meta: { tags: [tag.workspaces()] },
});

/**
 * A slug the list does not know: an old one (it redirects for 90 days) or one the list is not
 * up to date with yet. `404` — no such workspace, or not one of the user's.
 */
export const resolveSlugQuery = (slug: string) =>
  queryOptions({
    queryKey: QUERY_KEYS.workspaceSlug(slug),
    queryFn: ({ signal }) => resolveSlug({ slug }, { signal }),
    retry: false,
  });

/** The user in the workspace: owner or not, roles, what they may do there. */
export const workspaceMeQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: QUERY_KEYS.workspaceMe(workspaceId),
    queryFn: ({ signal }) => getMeInWorkspace(workspaceId, { signal }),
    meta: { workspaceId },
  });
