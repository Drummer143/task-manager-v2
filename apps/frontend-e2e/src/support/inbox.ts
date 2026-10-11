import type { Notification } from '@task-manager-v2/api/main/schemas';
import { json, status, type FakeApi } from './api';

export const WS = '00000000-0000-0000-0000-000000000000';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** A debug notification in the workspace (or account-level for `null`), its last event `minutes` ago. */
export const notification = (
  id: string,
  minutes: number,
  overrides: Partial<Notification> = {},
): Notification => ({
  id,
  kind: 'debug',
  facts: { message: id },
  userId: 'u',
  workspaceId: WS,
  readAt: null,
  archivedAt: null,
  createdAt: minutesAgo(minutes),
  updatedAt: minutesAgo(minutes),
  ...overrides,
} as Notification);

type View = 'unread' | 'all' | 'archived';

type Endpoint = 'list' | 'pinned' | 'summary' | 'read' | 'unread' | 'archive' | 'unarchive' | 'read_all';

const isUnread = (n: Notification) => !n.readAt && !n.archivedAt;

/** main-service's rules (`IN_WORKSPACE`, the tabs, the sort), on the fake's own rows. */
const inTab = (n: Notification, workspace: string, view: View) => {
  const inWorkspace = n.workspaceId === workspace || (n.workspaceId === null && !isUnread(n));

  if (!inWorkspace) return false;
  if (view === 'unread') return isUnread(n);
  if (view === 'all') return !n.archivedAt;
  return Boolean(n.archivedAt);
};

const sortDate = (n: Notification, view: View) =>
  Date.parse(view === 'archived' ? (n.archivedAt ?? n.updatedAt) : n.updatedAt);

/**
 * main-service's notifications with a state of their own: the tabs filter, pages come by cursor,
 * read / unread / archive / unarchive / read-all change the rows, the summary counts them. So a
 * refetch, an undo or a retry sees what the server would.
 */
export const fakeInbox = (api: FakeApi, initial: Notification[], { pageSize = 50 } = {}) => {
  const rows = initial.map((n) => ({ ...n }));
  const failing = new Map<Endpoint, number>();
  const held = new Map<Endpoint, Promise<void>>();

  /** True once for each failure asked for: the endpoint answers 500 and changes nothing. */
  const fails = (endpoint: Endpoint) => {
    const left = failing.get(endpoint) ?? 0;

    if (left === 0) return false;

    failing.set(endpoint, left - 1);
    return true;
  };

  const byIds = (ids: string[]) => rows.filter((n) => ids.includes(n.id));
  const now = () => new Date().toISOString();

  const summary = () => {
    const byWorkspace: Record<string, number> = {};
    let accountUnread = 0;

    for (const n of rows.filter(isUnread)) {
      if (!n.workspaceId) accountUnread++;
      else byWorkspace[n.workspaceId] = (byWorkspace[n.workspaceId] ?? 0) + 1;
    }

    return { byWorkspace, accountUnread };
  };

  const answer =
    (endpoint: Endpoint, body: (request: import('@playwright/test').Request) => unknown) =>
    async (route: import('@playwright/test').Route, request: import('@playwright/test').Request) => {
      await held.get(endpoint);

      if (fails(endpoint)) return status(500)(route, request);

      return json(body(request))(route, request);
    };

  api.on(
    'GET /notifications',
    answer('list', (request) => {
      const params = new URL(request.url()).searchParams;
      const view = (params.get('view') ?? 'unread') as View;
      const workspace = params.get('workspace') ?? '';
      const offset = Number(params.get('cursor') ?? 0);

      const tab = rows
        .filter((n) => inTab(n, workspace, view))
        .sort((a, b) => sortDate(b, view) - sortDate(a, view) || (a.id < b.id ? 1 : -1));
      const page = tab.slice(offset, offset + pageSize);

      return { data: page, nextCursor: offset + pageSize < tab.length ? String(offset + pageSize) : null };
    }),
  );

  api.on(
    'GET /notifications/account_pinned',
    answer('pinned', () => ({
      data: rows
        .filter((n) => n.workspaceId === null && isUnread(n))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    })),
  );

  api.on('GET /notifications/summary', answer('summary', summary));

  api.on(
    'POST /notifications/read',
    answer('read', (request) => {
      byIds((request.postDataJSON() as { ids: string[] }).ids).forEach((n) => (n.readAt ??= now()));
      return {};
    }),
  );

  api.on(
    'POST /notifications/unread',
    answer('unread', (request) => {
      byIds((request.postDataJSON() as { ids: string[] }).ids).forEach((n) => (n.readAt = null));
      return {};
    }),
  );

  api.on(
    'POST /notifications/archive',
    answer('archive', (request) => {
      byIds([(request.postDataJSON() as { id: string }).id]).forEach((n) => {
        n.archivedAt ??= now();
        n.readAt ??= n.archivedAt;
      });
      return {};
    }),
  );

  api.on(
    'POST /notifications/unarchive',
    answer('unarchive', (request) => {
      byIds([(request.postDataJSON() as { id: string }).id]).forEach((n) => (n.archivedAt = null));
      return {};
    }),
  );

  api.on(
    'POST /notifications/read_all',
    answer('read_all', (request) => {
      const { workspace, before } = request.postDataJSON() as { workspace: string; before: string };
      const affected = rows.filter(
        (n) =>
          (n.workspaceId === workspace || n.workspaceId === null) &&
          isUnread(n) &&
          Date.parse(n.updatedAt) <= Date.parse(before),
      );

      affected.forEach((n) => (n.readAt = now()));
      return { affected: affected.map((n) => n.id) };
    }),
  );

  return {
    rows,
    /** The next `times` calls of `endpoint` answer 500. */
    fail: (endpoint: Endpoint, times = 1) => failing.set(endpoint, times),
    /** Calls of `endpoint` wait until the returned function is called. */
    hold: (endpoint: Endpoint) => {
      let release!: () => void;
      held.set(endpoint, new Promise<void>((resolve) => (release = resolve)));
      return () => {
        held.delete(endpoint);
        release();
      };
    },
    row: (id: string) => rows.find((n) => n.id === id),
  };
};

export type FakeInbox = ReturnType<typeof fakeInbox>;
