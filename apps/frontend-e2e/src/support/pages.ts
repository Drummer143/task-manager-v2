import type { PageNodeResponse, PageResponse, PageType } from '@task-manager-v2/api/main/schemas';
import { WORKSPACE, json, status, type FakeApi } from './api';

const BASE = `/workspaces/${WORKSPACE.id}/pages`;

/** A page as the fake keeps it: the server's whole page, live or in the trash. */
export type FakePage = PageResponse;

export const page = (id: string, title: string, overrides: Partial<FakePage> = {}): FakePage => ({
  id,
  workspaceId: WORKSPACE.id,
  parentId: null,
  position: id,
  type: 'document',
  title,
  icon: null,
  shortId: `short${id}`.padEnd(10, 'x').slice(0, 10),
  access: 'full',
  version: 1,
  createdAt: '2026-10-24T10:00:00Z',
  updatedAt: '2026-10-24T10:00:00Z',
  ...overrides,
});

const node = (each: FakePage): PageNodeResponse => ({
  id: each.id,
  parentId: each.parentId,
  position: each.position,
  type: each.type,
  title: each.title,
  icon: each.icon,
  shortId: each.shortId,
  access: each.access,
  version: each.version,
});

/**
 * main-service's pages, kept in memory so a refetch shows what a request changed: the tree,
 * by-short, create (last under its parent), PATCH, delete and restore of one page.
 */
export const fakePages = (api: FakeApi, initial: FakePage[]) => {
  const pages = [...initial];
  let created = 0;

  const register = (each: FakePage) => {
    api.on(`GET ${BASE}/by-short/${each.shortId}`, (route, request) => json(pages.find((p) => p.id === each.id))(route, request));
    api.on(`PATCH ${BASE}/${each.id}`, (route, request) => {
      const { set } = request.postDataJSON() as { set: Partial<FakePage> };
      const current = pages.find((p) => p.id === each.id) as FakePage;
      Object.assign(current, set, { version: current.version + 1 });
      return json(current)(route, request);
    });
    api.on(`DELETE ${BASE}/${each.id}`, (route, request) => {
      const current = pages.find((p) => p.id === each.id) as FakePage;
      Object.assign(current, { deletedAt: '2026-10-24T11:00:00Z', deletedRoot: current.id });
      return status(204)(route, request);
    });
    api.on(`POST ${BASE}/${each.id}/restore`, (route, request) => {
      const current = pages.find((p) => p.id === each.id) as FakePage;
      Object.assign(current, { deletedAt: null, deletedRoot: null });
      return json({ page: current, restoredToRoot: false })(route, request);
    });
  };

  initial.forEach(register);

  // The sidebar's Inbox count, on every page of the workspace
  api.on('GET /notifications/summary', json({ byWorkspace: {}, accountUnread: 0 }));

  api.on(`GET ${BASE}`, (route, request) => json(pages.filter((p) => !p.deletedAt).map(node))(route, request));
  api.on(`POST ${BASE}`, (route, request) => {
    const body = request.postDataJSON() as { type: PageType; parentId?: string | null };
    created += 1;
    const made = page(`new${created}`, '', { type: body.type, parentId: body.parentId ?? null });
    pages.push(made);
    register(made);
    return json(made, 201)(route, request);
  });

  return { pages };
};
