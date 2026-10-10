import type { Page } from '@playwright/test';
import { type FakeApi, json } from './support/api';
import { expect, test } from './support/fixtures';

/**
 * The Account group (Inbox spec 01): the unread account-level notifications pinned above Today in
 * the Unread and All tabs, and how the optimistic changes move them.
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
  readAt: null,
  archivedAt: null,
  createdAt: ago(minutes),
  updatedAt: ago(minutes),
});

/**
 * A task notification in the workspace and an unread invite pinned above it. The fake keeps the
 * server's state where a refetch would show it: read-all unpins the invite.
 */
const openInbox = async (page: Page, api: FakeApi, view: 'all' | 'unread' | 'archived') => {
  let pinned = [notification('invite', 30, null)];

  api.on('GET /notifications', json({ data: view === 'archived' ? [] : [notification('task', 5, WS)], nextCursor: null }));
  api.on('GET /notifications/account_pinned', (route, request) => json({ data: pinned })(route, request));
  api.on('GET /notifications/summary', json({ byWorkspace: { [WS]: 1 }, accountUnread: 1 }));
  api.on('POST /notifications/read', json({}));
  api.on('POST /notifications/archive', json({}));
  api.on('POST /notifications/read_all', (route, request) => {
    pinned = [];
    return json({ affected: ['invite', 'task'] })(route, request);
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/${WS}/inbox?view=${view}`);

  return { errors };
};

const grid = (page: Page) => page.getByRole('grid', { name: 'Notifications' });
const headers = (page: Page) => grid(page).getByRole('rowheader');
const rowIds = (page: Page) =>
  grid(page)
    .locator('[role="row"][id^="inbox-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.id));
const isUnread = (page: Page, id: string) =>
  page.locator(`#inbox-row-${id}`).evaluate((row) => row.hasAttribute('data-unread'));
const sidebarCount = async (page: Page) =>
  Number((await page.getByRole('link', { name: /Inbox/ }).textContent())?.match(/\d+/)?.[0] ?? 0);

test('All: the group is on top; reading its row moves it into the list by its time', async ({ page, api }) => {
  const { errors } = await openInbox(page, api, 'all');

  await expect(headers(page)).toHaveText(['Account', 'Today']);
  await expect(page.locator('#inbox-row-invite')).toContainText('Account · invite');
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-invite');
  await expect.poll(() => sidebarCount(page)).toBe(2);

  await page.keyboard.press('u');

  // The empty group is gone; the invite, now read, ages after the newer task
  await expect(headers(page)).toHaveText(['Today']);
  expect(await rowIds(page)).toEqual(['inbox-row-task', 'inbox-row-invite']);
  expect(await isUnread(page, 'invite')).toBe(false);
  await expect.poll(() => sidebarCount(page)).toBe(1);
  // The cursor stays on the row it acted on
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-invite');
  expect(errors).toEqual([]);
});

test('Unread: a pinned row read there stays in the group until the tab changes', async ({ page, api }) => {
  const { errors } = await openInbox(page, api, 'unread');

  await expect(headers(page)).toHaveText(['Account', 'Today']);

  await page.keyboard.press('u');

  await expect.poll(() => isUnread(page, 'invite')).toBe(false);
  await expect(headers(page)).toHaveText(['Account', 'Today']);
  expect(errors).toEqual([]);
});

test('E on a pinned row archives it out of the group; the cursor steps to the next row', async ({ page, api }) => {
  const { errors } = await openInbox(page, api, 'all');

  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-invite');

  await page.keyboard.press('e');

  await expect(page.locator('#inbox-row-invite')).toHaveCount(0);
  await expect(headers(page)).toHaveText(['Today']);
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-task');
  expect(errors).toEqual([]);
});

test('Mark all read reads the pinned ones with the list', async ({ page, api }) => {
  const { errors } = await openInbox(page, api, 'all');

  await expect(headers(page)).toHaveText(['Account', 'Today']);

  await page.keyboard.press('Shift+U');

  await expect(headers(page)).toHaveText(['Today']);
  expect(await isUnread(page, 'invite')).toBe(false);
  expect(await isUnread(page, 'task')).toBe(false);
  expect(errors).toEqual([]);
});

test('Archived: no Account group', async ({ page, api }) => {
  const { errors } = await openInbox(page, api, 'archived');

  await expect(page.getByText('Nothing archived')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Account' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
