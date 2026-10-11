import React, { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitRoot, useCursorStore } from '@task-manager-v2/ui-kit';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import { queryClient } from '../../app/queryClient';
import { Inbox } from './Inbox';

/**
 * The Inbox page on its data: main-service is a fake with rows of its own (the tabs, the pages,
 * the mutations), so the page's queries, its optimistic patches and their rollbacks run as in the
 * app. The browser-level checks (scroll, the socket, focus) are in apps/frontend-e2e.
 */

// jsdom has no layout: a plain list stands in for VirtualList, with its footer. Reaching the end
// is the test's to say (`list.reachEnd()`), as scrolling would
const list = vi.hoisted(() => ({ reachEnd: () => undefined as void }));

vi.mock('@task-manager-v2/ui-kit', async (importOriginal) => {
  const kit = await importOriginal<typeof import('@task-manager-v2/ui-kit')>();

  const PlainList = <Item,>({
    data,
    renderItem,
    getKey,
    footer,
    onEndReached,
  }: {
    data: readonly Item[];
    renderItem(item: Item, index: number): React.ReactNode;
    getKey(item: Item): React.Key;
    footer?: React.ReactNode;
    onEndReached?(): void;
  }) => {
    useEffect(() => {
      // Nothing returned: React would take a returned promise for an async act left unawaited
      list.reachEnd = () => {
        onEndReached?.();
      };
    });

    return (
      <>
        <div role="rowgroup">
          {data.map((item, index) => (
            <React.Fragment key={getKey(item)}>{renderItem(item, index)}</React.Fragment>
          ))}
        </div>
        {footer}
      </>
    );
  };

  return { ...kit, VirtualList: PlainList };
});

const WS = 'ws-1';
const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
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

const server = vi.hoisted(() => ({
  rows: [] as Notification[],
  pageSize: 50,
  failing: new Set<string>(),
}));

const isUnread = (row: Notification) => !row.readAt && !row.archivedAt;

const fail = (endpoint: string) => {
  if (server.failing.has(endpoint)) throw new Error(`${endpoint} failed`);
};

vi.mock('@task-manager-v2/api/main', () => ({
  listNotifications: async ({ workspace, view = 'unread', cursor }: { workspace: string; view?: string; cursor?: string }) => {
    fail('list');
    const tab = server.rows
      .filter((row) => row.workspaceId === workspace || (!row.workspaceId && !isUnread(row)))
      .filter((row) => (view === 'unread' ? isUnread(row) : view === 'all' ? !row.archivedAt : Boolean(row.archivedAt)))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const offset = Number(cursor ?? 0);
    const end = offset + server.pageSize;

    return { data: tab.slice(offset, end), nextCursor: end < tab.length ? String(end) : null };
  },
  listPinnedAccountNotifications: async () => {
    fail('pinned');
    return { data: server.rows.filter((row) => !row.workspaceId && isUnread(row)) };
  },
  readNotification: vi.fn(async ({ ids }: { ids: string[] }) => {
    fail('read');
    server.rows.filter((row) => ids.includes(row.id)).forEach((row) => (row.readAt ??= new Date().toISOString()));
  }),
  unreadNotification: vi.fn(async ({ ids }: { ids: string[] }) => {
    fail('unread');
    server.rows.filter((row) => ids.includes(row.id)).forEach((row) => (row.readAt = null));
  }),
  archiveNotification: vi.fn(async ({ id }: { id: string }) => {
    fail('archive');
    server.rows
      .filter((row) => row.id === id)
      .forEach((row) => {
        row.archivedAt = new Date().toISOString();
        row.readAt ??= row.archivedAt;
      });
  }),
  unarchiveNotification: vi.fn(async ({ id }: { id: string }) => {
    fail('unarchive');
    server.rows.filter((row) => row.id === id).forEach((row) => (row.archivedAt = null));
  }),
  readAllNotifications: vi.fn(async ({ workspace }: { workspace: string; before: string }) => {
    fail('read_all');
    const affected = server.rows.filter((row) => (row.workspaceId === workspace || !row.workspaceId) && isUnread(row));
    affected.forEach((row) => (row.readAt = new Date().toISOString()));
    return { affected: affected.map((row) => row.id) };
  }),
}));

// The address's query, read from the DOM: a render must not write outside the component
const LocationProbe: React.FC = () => <output data-testid="location">{useLocation().search}</output>;

const location = () => screen.getByTestId('location').textContent;

const renderInbox = (search = '') =>
  render(
    <QueryClientProvider client={queryClient}>
      <KitRoot>
        <MemoryRouter initialEntries={[`/${WS}/inbox${search}`]}>
          <Routes>
            <Route path="/:workspace/inbox" element={<><Inbox /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </KitRoot>
    </QueryClientProvider>,
  );

const rowOf = (id: string) => document.getElementById(`inbox-row-${id}`);
const rowIds = () =>
  [...document.querySelectorAll('[role="row"][id^="inbox-row-"]')].map((row) => row.id.replace('inbox-row-', ''));
const isUnreadRow = (id: string) => rowOf(id)?.hasAttribute('data-unread');
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });

const api = async () => vi.mocked(await import('@task-manager-v2/api/main'));

beforeEach(() => {
  // The app's one retry, without its 1 s wait
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } });
  server.rows = [];
  server.pageSize = 50;
  server.failing.clear();
});

/** An error toast waits for a decision (the kit shows it until then): the user's way out of it. */
const dismissErrorToast = () => fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);

afterEach(async () => {
  // The page goes first, then what it left in flight: a retry landing in the next test's cache
  // would answer for it
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  useCursorStore.getState().clearCursor();
  vi.clearAllMocks();
});

describe('Inbox', { timeout: 15_000 }, () => {
  it('shows the All tab without ?view=, in time groups, with the Account group on top', async () => {
    server.rows = [n('a', 1), n('b', 40 * 24 * 60), n('invite', 5, { workspaceId: null })];
    renderInbox();

    await waitFor(() => expect(rowIds()).toEqual(['invite', 'a', 'b']));
    expect(screen.getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Account', 'Today', 'Earlier']);
    expect(rowOf('invite')?.textContent).toContain('Account · invite');
    expect(screen.getByRole('radio', { name: /All/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches tabs by the switcher and writes the tab into the address', async () => {
    server.rows = [n('unread', 1), n('read', 2, { readAt: at(1) })];
    renderInbox();
    await waitFor(() => expect(rowIds()).toEqual(['unread', 'read']));

    fireEvent.click(screen.getByRole('radio', { name: /Unread/ }));

    await waitFor(() => expect(rowIds()).toEqual(['unread']));
    expect(location()).toBe('?view=unread');
  });

  it.each([
    ['all', 'No notifications yet'],
    ['unread', 'You’re all caught up'],
    ['archived', 'Nothing archived'],
  ])('an empty %s tab has its own empty state', async (view, title) => {
    renderInbox(`?view=${view}`);

    expect(await screen.findByText(title)).toBeTruthy();
  });

  it('the empty Unread tab leads to All', async () => {
    renderInbox('?view=unread');

    fireEvent.click(await screen.findByRole('button', { name: /View all/ }));

    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });

  it('U reads the highlighted row, and again unreads it', async () => {
    server.rows = [n('a', 1)];
    renderInbox();
    await waitFor(() => expect(useCursorStore.getState().cursor).toBe('a'));

    press('u');
    await waitFor(() => expect(isUnreadRow('a')).toBe(false));
    await waitFor(async () => expect((await api()).readNotification).toHaveBeenCalledWith({ ids: ['a'] }));

    press('u');
    await waitFor(() => expect(isUnreadRow('a')).toBe(true));
    await waitFor(async () => expect((await api()).unreadNotification).toHaveBeenCalledWith({ ids: ['a'] }));
  });

  it('a failed read is undone and said', async () => {
    server.rows = [n('a', 1)];
    server.failing.add('read');
    renderInbox();
    await waitFor(() => expect(useCursorStore.getState().cursor).toBe('a'));

    press('u');

    expect(await screen.findAllByText('Couldn’t mark as read. Changes were undone.', {}, { timeout: 3_000 })).not.toHaveLength(0);
    expect(isUnreadRow('a')).toBe(true);
    dismissErrorToast();
  });

  it('E archives the highlighted row and steps the cursor on; Undo brings it back', async () => {
    server.rows = [n('a', 1), n('b', 2)];
    renderInbox();
    await waitFor(() => expect(useCursorStore.getState().cursor).toBe('a'));

    press('e');

    await waitFor(() => expect(rowIds()).toEqual(['b']));
    expect(useCursorStore.getState().cursor).toBe('b');
    await waitFor(async () => expect((await api()).archiveNotification).toHaveBeenCalledWith({ id: 'a' }));

    fireEvent.click(await screen.findByRole('button', { name: /Undo/ }, { timeout: 3_000 }));

    await waitFor(() => expect(rowIds()).toEqual(['a', 'b']));
    expect((await api()).unarchiveNotification).toHaveBeenCalledWith({ id: 'a' });
  });

  it('a failed archive puts the row back and says so', async () => {
    server.rows = [n('a', 1)];
    server.failing.add('archive');
    renderInbox();
    await waitFor(() => expect(useCursorStore.getState().cursor).toBe('a'));

    press('e');

    expect(await screen.findAllByText('Couldn’t archive. Changes were undone.', {}, { timeout: 3_000 })).not.toHaveLength(0);
    expect(rowIds()).toEqual(['a']);
    dismissErrorToast();
  });

  it('in the Archived tab, E unarchives', async () => {
    server.rows = [n('a', 1, { readAt: at(1), archivedAt: at(1) })];
    renderInbox('?view=archived');
    await waitFor(() => expect(useCursorStore.getState().cursor).toBe('a'));

    press('e');

    expect(await screen.findByText('Nothing archived')).toBeTruthy();
    expect((await api()).unarchiveNotification).toHaveBeenCalledWith({ id: 'a' });
  });

  it('⇧U reads all, the pinned ones too; Undo unreads what it read', async () => {
    server.rows = [n('a', 1), n('invite', 2, { workspaceId: null })];
    renderInbox();
    await waitFor(() => expect(rowIds()).toEqual(['invite', 'a']));

    press('U', { shiftKey: true });

    await waitFor(() => expect(isUnreadRow('a')).toBe(false));
    expect(await screen.findAllByText(/Marked 2 as read/, {}, { timeout: 3_000 })).not.toHaveLength(0);
    expect((await api()).readAllNotifications).toHaveBeenCalledWith(expect.objectContaining({ workspace: WS }));

    fireEvent.click(await screen.findByRole('button', { name: /Undo/ }, { timeout: 3_000 }));

    await waitFor(async () =>
      expect((await api()).unreadNotification).toHaveBeenCalledWith({ ids: expect.arrayContaining(['a', 'invite']) }),
    );
  });

  it('a failed read-all is undone and said', async () => {
    server.rows = [n('a', 1)];
    server.failing.add('read_all');
    renderInbox();
    await waitFor(() => expect(rowIds()).toEqual(['a']));

    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));

    expect(await screen.findAllByText('Couldn’t mark all read. Changes were undone.', {}, { timeout: 3_000 })).not.toHaveLength(0);
    expect(isUnreadRow('a')).toBe(true);
    dismissErrorToast();
  });

  it('in the Archived tab, Mark all read is off, and so is ⇧U', async () => {
    server.rows = [n('a', 1, { readAt: at(1), archivedAt: at(1) })];
    renderInbox('?view=archived');
    await waitFor(() => expect(rowIds()).toEqual(['a']));

    expect(screen.getByRole('button', { name: /Mark all read/ }).getAttribute('aria-disabled')).toBe('true');
    press('U', { shiftKey: true });
    expect((await api()).readAllNotifications).not.toHaveBeenCalled();
  });

  it('loads the next page; a failed one keeps the list and offers a retry', async () => {
    server.pageSize = 2;
    server.rows = [n('a', 1), n('b', 2), n('c', 3), n('d', 4), n('e', 5)];
    renderInbox();
    await waitFor(() => expect(rowIds()).toEqual(['a', 'b']));

    act(() => {
      list.reachEnd();
    });
    await waitFor(() => expect(rowIds()).toEqual(['a', 'b', 'c', 'd']));

    server.failing.add('list');
    act(() => {
      list.reachEnd();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy(), { timeout: 5_000 });
    expect(rowIds()).toEqual(['a', 'b', 'c', 'd']);

    server.failing.delete('list');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(rowIds()).toEqual(['a', 'b', 'c', 'd', 'e']));
  });

  it('a failed first load says so; Retry loads it', async () => {
    server.rows = [n('a', 1)];
    server.failing.add('list');
    renderInbox();

    expect(await screen.findByText('Couldn’t load notifications', {}, { timeout: 5_000 })).toBeTruthy();
    server.failing.delete('list');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(rowIds()).toEqual(['a']), { timeout: 5_000 });
  });

  it('the pinned group failed: its line under the Account header; Retry brings it', async () => {
    server.rows = [n('a', 1), n('invite', 2, { workspaceId: null })];
    server.failing.add('pinned');
    renderInbox();

    expect(await screen.findByText('Couldn’t load account notifications', {}, { timeout: 5_000 })).toBeTruthy();
    expect(rowIds()).toEqual(['a']);

    server.failing.delete('pinned');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(rowIds()).toEqual(['invite', 'a']));
  });

  it('the list failed with the pinned group in: the group on top, the banner under it', async () => {
    server.rows = [n('a', 1), n('invite', 2, { workspaceId: null })];
    server.failing.add('list');
    renderInbox();

    expect(await screen.findByText('Couldn’t load notifications', {}, { timeout: 5_000 })).toBeTruthy();
    expect(rowIds()).toEqual(['invite']);
  });
});
