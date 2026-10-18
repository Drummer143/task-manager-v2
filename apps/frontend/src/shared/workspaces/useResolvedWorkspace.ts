import { useQuery } from '@tanstack/react-query';
import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import { isAxiosError } from 'axios';
import { useEffect } from 'react';
import { resolveSlugQuery, workspacesQuery } from './queries';

export type ResolvedWorkspace =
  | { status: 'pending' }
  | { status: 'found'; workspace: WorkspaceWithRoles }
  /** No such workspace, or the user is not in it (any more). */
  | { status: 'missing' }
  | { status: 'error'; retry(): void };

const isNotFound = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

/**
 * The workspace a slug of the address names. The list knows the slugs of all the user's
 * workspaces, so it answers almost always; only a slug it does not know is asked for. The
 * found workspace may have another slug than the address — an old one, another case — and the
 * caller puts the canonical one in its place.
 */
export const useResolvedWorkspace = (slug: string): ResolvedWorkspace => {
  const list = useQuery(workspacesQuery);
  const fromList = list.data?.find((workspace) => workspace.slug === slug);

  const resolved = useQuery({
    ...resolveSlugQuery(slug),
    enabled: list.data !== undefined && fromList === undefined,
  });

  const resolvedId = resolved.data?.id;
  const byId = resolvedId === undefined ? undefined : list.data?.find((workspace) => workspace.id === resolvedId);
  const refetchList = list.refetch;

  // The slug is one of the user's, and the list is behind: a workspace they joined since
  useEffect(() => {
    if (resolvedId !== undefined && byId === undefined) void refetchList();
  }, [resolvedId, byId, refetchList]);

  const workspace = fromList ?? byId;
  if (workspace) return { status: 'found', workspace };

  // Fetched again after the slug was resolved, and still not there: not one to open
  if (resolvedId !== undefined && list.dataUpdatedAt > resolved.dataUpdatedAt) return { status: 'missing' };

  if (list.isError) return { status: 'error', retry: () => void list.refetch() };
  if (resolved.isError) {
    return isNotFound(resolved.error) ? { status: 'missing' } : { status: 'error', retry: () => void resolved.refetch() };
  }

  return { status: 'pending' };
};
