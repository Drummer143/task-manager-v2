import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxUpdated, ListNotificationsView, Notification, SummaryResponse } from '@task-manager-v2/api/main/schemas';
import { queryClient } from '../../app/queryClient';
import { QUERY_KEYS } from '../constants/queryKeys';
import {
  cachedNotification,
  hold,
  patchArchiveNotification,
  patchReadAll,
  patchReadNotification,
  receiveInboxUpdate,
  refetchInbox,
  release,
} from './cache';
import { useRemoteFlashStore } from './remoteFlash';

const WS = 'ws-1';
const OTHER = 'ws-2';
const NOW = Date.parse('2026-10-11T12:00:00Z');
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const n = (id: string, minutes: number, overrides: Partial<Notification> = {}): Notification =>
  ({
    id,
    kind: 'debug',
    facts: { message: id },
    userId: 'u',
    workspaceId: WS,
    readAt: null,
    archivedAt: null,
    createdAt: at(minutes),
    updatedAt: at(minutes),
    ...overrides,
  }) as Notification;

const setList = (view: ListNotificationsView, rows: Notification[], workspace = WS, nextCursor: string | null = null) =>
  queryClient.setQueryData(QUERY_KEYS.inboxWithView(workspace, view), {
    pages: [{ data: rows, nextCursor }],
    pageParams: [undefined],
  });

const list = (view: ListNotificationsView, workspace = WS) =>
  (
    queryClient.getQueryData(QUERY_KEYS.inboxWithView(workspace, view)) as
      | { pages: { data: Notification[] }[] }
      | undefined
  )?.pages.flatMap((page) => page.data) ?? [];

const ids = (view: ListNotificationsView, workspace = WS) => list(view, workspace).map((row) => row.id);

const setPinned = (view: 'unread' | 'all', rows: Notification[]) =>
  queryClient.setQueryData(QUERY_KEYS.inboxPinnedWithView(view), rows);

const pinned = (view: 'unread' | 'all') =>
  (queryClient.getQueryData(QUERY_KEYS.inboxPinnedWithView(view)) as Notification[] | undefined) ?? [];

const setSummary = (summary: SummaryResponse) => queryClient.setQueryData(QUERY_KEYS.inboxSummary, summary);

const summary = () => queryClient.getQueryData(QUERY_KEYS.inboxSummary) as SummaryResponse;

const update = (part: Partial<InboxUpdated>): InboxUpdated => ({
  summary: { byWorkspace: {}, accountUnread: 0 },
  ...part,
});

afterEach(() => {
  queryClient.clear();
  useRemoteFlashStore.setState({ keys: {} });
  vi.restoreAllMocks();
});

describe('cachedNotification', () => {
  it('finds a notification in a list or in a pinned group', () => {
    setList('all', [n('a', 1)]);
    setPinned('all', [n('invite', 2, { workspaceId: null })]);

    expect(cachedNotification('a')?.id).toBe('a');
    expect(cachedNotification('invite')?.id).toBe('invite');
    expect(cachedNotification('missing')).toBeUndefined();
  });
});

describe('patchReadNotification', () => {
  it('reads in place in every tab, moves the count, and rolls both back', () => {
    setList('all', [n('a', 1), n('b', 2)]);
    setList('unread', [n('a', 1), n('b', 2)]);
    setSummary({ byWorkspace: { [WS]: 2 }, accountUnread: 0 });

    const rollback = patchReadNotification(['a'], { readAt: at(0) });

    // A row read in Unread stays there until the tab changes
    expect(ids('unread')).toEqual(['a', 'b']);
    expect(list('all')[0].readAt).toBe(at(0));
    expect(summary().byWorkspace[WS]).toBe(1);

    rollback();

    expect(list('all')[0].readAt).toBeNull();
    expect(summary().byWorkspace[WS]).toBe(2);
  });

  it('counts each notification once, however many tabs hold it', () => {
    setList('all', [n('a', 1)]);
    setList('unread', [n('a', 1)]);
    setSummary({ byWorkspace: { [WS]: 1 }, accountUnread: 0 });

    patchReadNotification(['a'], { readAt: at(0) });

    expect(summary().byWorkspace[WS]).toBe(0);
  });

  it('a pinned one read in All moves into the list; in Unread it stays pinned', () => {
    const invite = n('invite', 30, { workspaceId: null });
    setList('all', [n('a', 1), n('b', 60)]);
    setPinned('all', [invite]);
    setPinned('unread', [invite]);
    setSummary({ byWorkspace: {}, accountUnread: 1 });

    patchReadNotification(['invite'], { readAt: at(0) });

    expect(pinned('all')).toEqual([]);
    expect(ids('all')).toEqual(['a', 'invite', 'b']);
    expect(pinned('unread').map((row) => row.readAt)).toEqual([at(0)]);
    expect(summary().accountUnread).toBe(0);
  });

  it('leaves the summary alone when there is none yet, and never counts below zero', () => {
    setList('all', [n('a', 1)]);

    patchReadNotification(['a'], { readAt: at(0) });
    expect(queryClient.getQueryData(QUERY_KEYS.inboxSummary)).toBeUndefined();

    setSummary({ byWorkspace: {}, accountUnread: 0 });
    patchReadNotification(['a'], { readAt: null });
    patchReadNotification(['a'], { readAt: at(0) });
    patchReadNotification(['a'], { readAt: at(0) });
    expect(summary().byWorkspace[WS]).toBe(0);
  });
});

describe('patchReadAll', () => {
  it('reads what the server would: the workspace and the account, up to the moment', () => {
    setList('all', [
      n('mine', 10),
      n('later', 0),
      n('read', 20, { readAt: at(15) }),
      n('handled-invite', 30, { workspaceId: null, readAt: at(25) }),
    ]);
    setList('all', [n('elsewhere', 10, { workspaceId: OTHER })], OTHER);
    setPinned('all', [n('invite', 40, { workspaceId: null })]);

    const { ids: read } = patchReadAll(WS, at(5), at(0));

    expect(read.sort()).toEqual(['invite', 'mine']);
    expect(list('all', OTHER)[0].readAt).toBeNull();
  });
});

describe('patchArchiveNotification', () => {
  it('archives out of All into Archived, out of the pinned groups, and rolls back', () => {
    const invite = n('invite', 30, { workspaceId: null });
    setList('all', [n('a', 1)]);
    setList('archived', [n('old', 60, { readAt: at(50), archivedAt: at(50) })]);
    setPinned('all', [invite]);
    setSummary({ byWorkspace: {}, accountUnread: 1 });

    const rollback = patchArchiveNotification(invite, at(0));

    expect(pinned('all')).toEqual([]);
    expect(ids('archived')).toEqual(['invite', 'old']);
    expect(summary().accountUnread).toBe(0);

    rollback();

    expect(pinned('all').map((row) => row.id)).toEqual(['invite']);
    expect(ids('archived')).toEqual(['old']);
    expect(summary().accountUnread).toBe(1);
  });

  it('unarchives back into All, read, at its place by time', () => {
    const done = n('done', 30, { readAt: at(20), archivedAt: at(20) });
    setList('all', [n('a', 1), n('b', 60)]);
    setList('archived', [done]);

    patchArchiveNotification(done, null);

    expect(ids('all')).toEqual(['a', 'done', 'b']);
    expect(ids('archived')).toEqual([]);
  });

  it('a row past the loaded pages is not put on the last one', () => {
    setList('all', [n('a', 1)], WS, 'next-page');

    patchArchiveNotification(n('old', 600, { readAt: at(500), archivedAt: at(500) }), null);

    expect(ids('all')).toEqual(['a']);
  });
});

describe('receiveInboxUpdate', () => {
  it('a new notification goes to its place, tinted; the summary is the server’s', () => {
    setList('all', [n('old', 30)]);
    setSummary({ byWorkspace: { [WS]: 1 }, accountUnread: 0 });

    receiveInboxUpdate(update({ upserted: [n('new', 0)], summary: { byWorkspace: { [WS]: 2 }, accountUnread: 0 } }));

    expect(ids('all')).toEqual(['new', 'old']);
    expect(useRemoteFlashStore.getState().keys.new).toBeDefined();
    expect(useRemoteFlashStore.getState().keys.old).toBeUndefined();
    expect(summary().byWorkspace[WS]).toBe(2);
  });

  it('a new unread account-level one is pinned, newest first', () => {
    setPinned('all', [n('older-invite', 30, { workspaceId: null })]);

    receiveInboxUpdate(update({ upserted: [n('invite', 0, { workspaceId: null })] }));

    expect(pinned('all').map((row) => row.id)).toEqual(['invite', 'older-invite']);
  });

  it('read elsewhere: changed where it is, not moved, not tinted', () => {
    setList('unread', [n('a', 1), n('b', 2)]);

    receiveInboxUpdate(update({ upserted: [n('a', 1, { readAt: at(0) })] }));

    expect(ids('unread')).toEqual(['a', 'b']);
    expect(list('unread')[0].readAt).toBe(at(0));
    expect(useRemoteFlashStore.getState().keys.a).toBeUndefined();
  });

  it('archived elsewhere: it leaves All for Archived', () => {
    setList('all', [n('a', 1)]);
    setList('archived', []);

    receiveInboxUpdate(update({ upserted: [n('a', 1, { readAt: at(0), archivedAt: at(0) })] }));

    expect(ids('all')).toEqual([]);
    expect(ids('archived')).toEqual(['a']);
  });

  it('a read-all elsewhere reads the loaded rows by its rule, in place', () => {
    setList('all', [n('a', 10), n('later', 0)]);
    setPinned('unread', [n('invite', 20, { workspaceId: null })]);

    receiveInboxUpdate(update({ readAll: { workspace: WS, before: at(5), readAt: at(1) } }));

    expect(list('all').map((row) => row.readAt)).toEqual([at(1), null]);
    expect(pinned('unread')[0].readAt).toBe(at(1));
  });

  it('skips a notification whose own change is in flight, and fetches the summary once it settles', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    setList('all', [n('a', 1, { readAt: at(0) })]);
    setSummary({ byWorkspace: { [WS]: 0 }, accountUnread: 0 });
    hold(['a']);

    // An echo of the state before our own read
    receiveInboxUpdate(update({ upserted: [n('a', 1)], summary: { byWorkspace: { [WS]: 1 }, accountUnread: 0 } }));

    expect(list('all')[0].readAt).toBe(at(0));
    expect(summary().byWorkspace[WS]).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();

    release(['a']);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.inboxSummary });
  });

  it('counts holds: released twice for two holds before it is free', () => {
    setList('all', [n('a', 1)]);
    hold(['a']);
    hold(['a']);
    release(['a']);

    receiveInboxUpdate(update({ upserted: [n('a', 1, { readAt: at(0) })] }));
    expect(list('all')[0].readAt).toBeNull();

    release(['a']);
    receiveInboxUpdate(update({ upserted: [n('a', 1, { readAt: at(0) })] }));
    expect(list('all')[0].readAt).toBe(at(0));
  });
});

it('refetchInbox fetches the lists, the pinned groups and the summary again', async () => {
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await refetchInbox();

  expect(invalidate).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.inbox });
});
