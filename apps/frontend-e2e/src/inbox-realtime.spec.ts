import type { Page } from '@playwright/test';
import { json, type FakeApi } from './support/api';
import { expect, test } from './support/fixtures';
import type { FakeRealtime } from './support/realtime';

/**
 * `inbox.updated` over the socket lands in the page without a refetch (Inbox spec 10): what
 * changed, here or in another tab, and the counts after it.
 */
test.use({ signedIn: true });

const WS = '00000000-0000-0000-0000-000000000000';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const notification = (id: string, minutes: number, workspaceId: string | null) => ({
  id,
  kind: 'debug',
  facts: { message: id },
  userId: 'u',
  workspaceId,
  readAt: null as string | null,
  archivedAt: null as string | null,
  createdAt: ago(minutes),
  updatedAt: ago(minutes),
});

const summary = (unread: number, accountUnread = 0) => ({ byWorkspace: { [WS]: unread }, accountUnread });

const openInbox = async (page: Page, api: FakeApi, realtime: FakeRealtime) => {
  api.on('GET /notifications', json({ data: [notification('old', 30, WS)], nextCursor: null }));
  api.on('GET /notifications/account_pinned', json({ data: [] }));
  api.on('GET /notifications/summary', json(summary(1)));

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/${WS}/inbox?view=all`);
  await expect(page.locator('#inbox-row-old')).toBeVisible();
  await expect.poll(() => realtime.connections.some((c) => c.joined.has('notifications'))).toBe(true);

  return { errors, send: (update: unknown) => realtime.push('notifications', 'inbox.updated', update) };
};

const grid = (page: Page) => page.getByRole('grid', { name: 'Notifications' });
const rowIds = (page: Page) =>
  grid(page)
    .locator('[role="row"][id^="inbox-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.id));
const isUnread = (page: Page, id: string) =>
  page.locator(`#inbox-row-${id}`).evaluate((row) => row.hasAttribute('data-unread'));
const isTinted = (page: Page, id: string) =>
  page.locator(`#inbox-row-${id}`).evaluate((row) => row.querySelector('[class*="remoteFlash"]') !== null);
const sidebarCount = async (page: Page) =>
  Number((await page.getByRole('link', { name: /Inbox/ }).textContent())?.match(/\d+/)?.[0] ?? 0);

test('a new notification goes on top, tinted; the count is the server’s; the cursor stays', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-old');

  send({ upserted: [notification('new', 0, WS)], summary: summary(2) });

  await expect(page.locator('#inbox-row-new')).toBeVisible();
  expect(await rowIds(page)).toEqual(['inbox-row-new', 'inbox-row-old']);
  expect(await isTinted(page, 'new')).toBe(true);
  expect(await isTinted(page, 'old')).toBe(false);
  await expect.poll(() => sidebarCount(page)).toBe(2);
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-old');
  expect(errors).toEqual([]);
});

test('a new account-level notification is pinned in the Account group', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ upserted: [notification('invite', 0, null)], summary: summary(1, 1) });

  await expect(grid(page).getByRole('rowheader')).toHaveText(['Account', 'Today']);
  await expect(page.locator('#inbox-row-invite')).toContainText('Account · invite');
  await expect.poll(() => sidebarCount(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('read in another tab: the row changes where it is', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ upserted: [{ ...notification('old', 30, WS), readAt: ago(0) }], summary: summary(0) });

  await expect.poll(() => isUnread(page, 'old')).toBe(false);
  expect(await rowIds(page)).toEqual(['inbox-row-old']);
  expect(await isTinted(page, 'old')).toBe(false);
  await expect.poll(() => sidebarCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('archived in another tab: the row leaves the All tab', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ upserted: [{ ...notification('old', 30, WS), readAt: ago(0), archivedAt: ago(0) }], summary: summary(0) });

  await expect(page.locator('#inbox-row-old')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('read-all in another tab reads what is loaded here by the same rule', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ readAll: { workspace: WS, before: ago(0), readAt: ago(0) }, summary: summary(0) });

  await expect.poll(() => isUnread(page, 'old')).toBe(false);
  await expect.poll(() => sidebarCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the same new notification delivered twice is one row', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ upserted: [notification('new', 0, WS)], summary: summary(2) });
  await expect(page.locator('#inbox-row-new')).toBeVisible();
  send({ upserted: [notification('new', 0, WS)], summary: summary(2) });

  await expect.poll(() => rowIds(page)).toEqual(['inbox-row-new', 'inbox-row-old']);
  expect(errors).toEqual([]);
});

test('a notification of another workspace adds no row here', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  send({ upserted: [notification('elsewhere', 0, '00000000-0000-0000-0000-0000000000ff')], summary: summary(1) });

  await expect.poll(() => rowIds(page)).toEqual(['inbox-row-old']);
  expect(errors).toEqual([]);
});

test('the echo of an older state does not undo a change still on its way', async ({ page, api, realtime }) => {
  const { errors, send } = await openInbox(page, api, realtime);

  // Our own read is slow: while it flies, an event with the old (unread) state arrives
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  api.on('POST /notifications/read', async (route, request) => {
    await answered;
    await json({})(route, request);
  });

  await page.keyboard.press('u');
  await expect.poll(() => isUnread(page, 'old')).toBe(false);

  send({ upserted: [notification('old', 30, WS)], summary: summary(1) });
  // Events are applied in order: once this marker is in, the stale one above was handled
  send({ upserted: [notification('marker', 0, WS)], summary: summary(2) });
  await expect(page.locator('#inbox-row-marker')).toBeVisible();
  expect(await isUnread(page, 'old')).toBe(false);

  answer();
  expect(errors).toEqual([]);
});

test.describe('the scroll stays where the reader is', () => {
  const longInbox = async (page: Page, api: FakeApi, realtime: FakeRealtime) => {
    const rows = Array.from({ length: 40 }, (_, i) => notification(`r${String(i).padStart(2, '0')}`, 10 + i, WS));
    api.on('GET /notifications', json({ data: rows, nextCursor: null }));
    api.on('GET /notifications/account_pinned', json({ data: [] }));
    api.on('GET /notifications/summary', json(summary(40)));

    await page.goto(`/${WS}/inbox?view=all`);
    await expect(page.locator('#inbox-row-r00')).toBeVisible();
    await expect.poll(() => realtime.connections.some((c) => c.joined.has('notifications'))).toBe(true);

    return (id: string) =>
      realtime.push('notifications', 'inbox.updated', { upserted: [notification(id, 0, WS)], summary: summary(41) });
  };

  /** The first row whose top is in the list's view, and how far from the top it is. */
  const firstInView = (page: Page) =>
    grid(page).evaluate((list) => {
      const top = list.getBoundingClientRect().top;

      return [...list.querySelectorAll<HTMLElement>('[role="row"][id^="inbox-row-"]')]
        .map((row) => ({ id: row.id, top: Math.round(row.getBoundingClientRect().top - top) }))
        .filter((row) => row.top >= 0)
        .sort((a, b) => a.top - b.top)[0];
    });

  test('at the top, a new notification shows up on top', async ({ page, api, realtime }) => {
    const send = await longInbox(page, api, realtime);

    send('new');

    await expect(page.locator('#inbox-row-new')).toBeInViewport();
    expect(await grid(page).evaluate((list) => list.scrollTop)).toBe(0);
  });

  test('scrolled down, the rows in view do not move when one comes above them', async ({ page, api, realtime }) => {
    const send = await longInbox(page, api, realtime);
    await grid(page).evaluate((list) => (list.scrollTop = 600));
    await expect.poll(() => grid(page).evaluate((list) => list.scrollTop)).toBe(600);
    const before = await firstInView(page);

    send('new');

    // The list grew above the view: the scroll grew with it, the reader sees the same rows
    await expect.poll(() => grid(page).evaluate((list) => list.scrollTop)).toBeGreaterThan(600);
    expect(await firstInView(page)).toEqual(before);
  });
});
