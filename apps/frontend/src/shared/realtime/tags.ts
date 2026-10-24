import type { Query } from '@tanstack/react-query';

/**
 * Tags say what data a query depends on (`meta.tags`); a `data.changed` signal names the stale
 * tags, and the queries carrying them are fetched again. The one place tag strings are built:
 * main-service builds the same ones (backend spec "notifications and refresh" §2.1).
 *
 * A query of one workspace's data also names it in `meta.workspaceId`: a rejoin of that
 * workspace's channel refetches all of them.
 */
export const tag = {
  /** One workspace: name, slug, task prefix, icon (`GET /workspaces/{id}`). */
  workspace: (workspaceId: string) => `workspace:${workspaceId}` as const,
  /** The signed-in user's workspaces (`GET /workspaces`). */
  workspaces: () => 'workspaces' as const,
  /** A workspace's pages tree: titles, icons, types, what is where (`GET …/pages`). */
  tree: (workspaceId: string) => `tree:${workspaceId}` as const,
  /** One page: its title, icon, type, place. */
  page: (pageId: string) => `page:${pageId}` as const,
};

export type Tag = ReturnType<(typeof tag)[keyof typeof tag]>;

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** What the query depends on: a signal naming one of these fetches it again. */
      tags?: readonly Tag[];
      /** The workspace whose data it is: refetched when that workspace's channel rejoins. */
      workspaceId?: string;
    };
  }
}

/** The tags a query declared. */
export const tagsOf = (query: Query): readonly string[] => query.meta?.tags ?? [];
