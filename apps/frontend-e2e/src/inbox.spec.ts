import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { SLUG, fakeInbox, notification } from './support/inbox';

/**
 * Inbox (spec "[Уведомления] Inbox"): the tabs, the groups, the keyboard, read / archive / read-all
 * with their undo and their failures, the pages, the loading and error states. The server is
 * `fakeInbox`: it keeps its own rows, so a refetch or an undo sees what main-service would.
 * The Account group and the socket have their own specs.
 */
test.use({ signedIn: true });

const DAY = 24 * 60;

const open = async (page: Page, view?: 'unread' | 'all' | 'archived') => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(view ? `/${SLUG}/inbox?view=${view}` : `/${SLUG}/inbox`);

  return { errors };
};

const grid = (page: Page) => page.getByRole('grid', { name: 'Notifications' });
const row = (page: Page, id: string) => page.locator(`#inbox-row-${id}`);
const rowIds = (page: Page) =>
  grid(page)
    .locator('[role="row"][id^="inbox-row-"]')
    .evaluateAll((rows) => rows.map((r) => r.id.replace('inbox-row-', '')));
const cursorOn = (page: Page, id: string) => expect(grid(page)).toHaveAttribute('aria-activedescendant', `inbox-row-${id}`);
const isUnread = (page: Page, id: string) => row(page, id).evaluate((r) => r.hasAttribute('data-unread'));
const tab = (page: Page, name: 'Unread' | 'All' | 'Archived') => page.getByRole('radio', { name });
const sidebarCount = async (page: Page) =>
  Number((await page.getByRole('link', { name: /Inbox/ }).textContent())?.match(/\d+/)?.[0] ?? 0);
const toast = (page: Page, text: string) => page.getByText(text).first();

test.describe('tabs', () => {
  test('opens on All; a tab shows its own rows and goes into the address', async ({ page, api }) => {
    fakeInbox(api, [
      notification('unread', 1),
      notification('read', 2, { readAt: new Date().toISOString() }),
      notification('done', 3, { readAt: new Date().toISOString(), archivedAt: new Date().toISOString() }),
    ]);
    const { errors } = await open(page);

    await expect(tab(page, 'All')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => rowIds(page)).toEqual(['unread', 'read']);

    await tab(page, 'Unread').click();
    await expect(page).toHaveURL(/view=unread/);
    await expect.poll(() => rowIds(page)).toEqual(['unread']);

    await tab(page, 'Archived').click();
    await expect.poll(() => rowIds(page)).toEqual(['done']);
    expect(errors).toEqual([]);
  });

  test('G U, G A, G E switch the tabs from the keyboard', async ({ page, api }) => {
    fakeInbox(api, [notification('a', 1)]);
    await open(page);
    await expect(row(page, 'a')).toBeVisible();

    await page.keyboard.press('g');
    await page.keyboard.press('e');
    await expect(tab(page, 'Archived')).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('g');
    await page.keyboard.press('u');
    await expect(tab(page, 'Unread')).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('g');
    await page.keyboard.press('a');
    await expect(tab(page, 'All')).toHaveAttribute('aria-checked', 'true');
  });

  test('each tab has its own empty state; Unread leads to All', async ({ page, api }) => {
    fakeInbox(api, []);
    await open(page, 'unread');

    await expect(page.getByText('You’re all caught up')).toBeVisible();
    await page.getByRole('button', { name: /View all/ }).click();

    await expect(page.getByText('No notifications yet')).toBeVisible();
    await tab(page, 'Archived').click();
    await expect(page.getByText('Nothing archived')).toBeVisible();
  });
});

test('rows come in time groups, newest first', async ({ page, api }) => {
  fakeInbox(api, [notification('now', 1), notification('long-ago', 40 * DAY), notification('earlier-today', 30)]);
  await open(page);

  await expect(grid(page).getByRole('rowheader')).toHaveText(['Today', 'Earlier']);
  expect(await rowIds(page)).toEqual(['now', 'earlier-today', 'long-ago']);
});

test.describe('the cursor', () => {
  test('J / K and the arrows move it, Home / End jump on the list, a click puts it on a row', async ({ page, api }) => {
    fakeInbox(api, [notification('a', 1), notification('b', 2), notification('c', 3), notification('d', 4)]);
    await open(page);
    await cursorOn(page, 'a');

    await page.keyboard.press('j');
    await page.keyboard.press('ArrowDown');
    await cursorOn(page, 'c');
    await page.keyboard.press('k');
    await cursorOn(page, 'b');

    // At the ends it stays
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await cursorOn(page, 'a');

    await grid(page).focus();
    await page.keyboard.press('End');
    await cursorOn(page, 'd');
    await page.keyboard.press('Home');
    await cursorOn(page, 'a');

    await row(page, 'c').click();
    await expect(grid(page)).toHaveAttribute('aria-activedescendant', 'inbox-row-c');
  });

  test('works in a non-Latin layout: the letter on the E key archives', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1), notification('b', 2)]);
    await open(page);
    await cursorOn(page, 'a');

    // Russian layout: the E key types «у»
    await page.evaluate(() =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'у', code: 'KeyE', bubbles: true, cancelable: true })),
    );

    await expect(row(page, 'a')).toHaveCount(0);
    await expect.poll(() => server.row('a')?.archivedAt).toBeTruthy();
  });
});

test.describe('read and unread', () => {
  test('U reads the highlighted row and unreads it again; the count follows', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1), notification('b', 2)]);
    const { errors } = await open(page);
    await cursorOn(page, 'a');
    await expect.poll(() => sidebarCount(page)).toBe(2);

    await page.keyboard.press('u');
    await expect.poll(() => isUnread(page, 'a')).toBe(false);
    await expect.poll(() => server.row('a')?.readAt).toBeTruthy();
    await expect.poll(() => sidebarCount(page)).toBe(1);

    await page.keyboard.press('u');
    await expect.poll(() => isUnread(page, 'a')).toBe(true);
    await expect.poll(() => server.row('a')?.readAt).toBeNull();
    await expect.poll(() => sidebarCount(page)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('a read row stays in the Unread tab until the tab changes', async ({ page, api }) => {
    fakeInbox(api, [notification('a', 1), notification('b', 2)]);
    await open(page, 'unread');
    await cursorOn(page, 'a');

    await page.keyboard.press('u');
    await expect.poll(() => isUnread(page, 'a')).toBe(false);
    expect(await rowIds(page)).toEqual(['a', 'b']);

    await tab(page, 'All').click();
    await tab(page, 'Unread').click();
    await expect.poll(() => rowIds(page)).toEqual(['b']);
  });

  test('a failed read is undone and said', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1)]);
    await open(page);
    await cursorOn(page, 'a');
    server.fail('read');

    await page.keyboard.press('u');

    await expect(toast(page, 'Couldn’t mark as read. Changes were undone.')).toBeVisible();
    expect(await isUnread(page, 'a')).toBe(true);
    await expect.poll(() => sidebarCount(page)).toBe(1);
  });
});

test.describe('archive', () => {
  test('E archives: the row leaves, the cursor steps to the next one; Undo brings it back', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1), notification('b', 2), notification('c', 3)]);
    const { errors } = await open(page);
    await cursorOn(page, 'a');
    await page.keyboard.press('j');
    await cursorOn(page, 'b');

    await page.keyboard.press('e');

    await expect(row(page, 'b')).toHaveCount(0);
    await cursorOn(page, 'c');
    await expect.poll(() => server.row('b')?.archivedAt).toBeTruthy();

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect.poll(() => rowIds(page)).toEqual(['a', 'b', 'c']);
    await expect.poll(() => server.row('b')?.archivedAt).toBeNull();
    expect(errors).toEqual([]);
  });

  test('the last row archived: the cursor steps back to the previous one', async ({ page, api }) => {
    fakeInbox(api, [notification('a', 1), notification('b', 2)]);
    await open(page);
    await cursorOn(page, 'a');
    await page.keyboard.press('j');
    await cursorOn(page, 'b');

    await page.keyboard.press('e');

    await expect(row(page, 'b')).toHaveCount(0);
    await cursorOn(page, 'a');
  });

  test('in the Archived tab, E unarchives', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1, { readAt: new Date().toISOString(), archivedAt: new Date().toISOString() })]);
    await open(page, 'archived');
    await cursorOn(page, 'a');

    await page.keyboard.press('e');

    await expect(page.getByText('Nothing archived')).toBeVisible();
    await expect.poll(() => server.row('a')?.archivedAt).toBeNull();
  });

  test('a failed archive puts the row back and says so', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1), notification('b', 2)]);
    await open(page);
    await cursorOn(page, 'a');
    server.fail('archive');

    await page.keyboard.press('e');

    await expect(toast(page, 'Couldn’t archive. Changes were undone.')).toBeVisible();
    await expect.poll(() => rowIds(page)).toEqual(['a', 'b']);
  });
});

test.describe('mark all read', () => {
  test('⇧U reads everything; Undo unreads exactly what it read', async ({ page, api }) => {
    const server = fakeInbox(api, [
      notification('a', 1),
      notification('b', 2),
      notification('read-before', 3, { readAt: new Date().toISOString() }),
    ]);
    const { errors } = await open(page);
    await expect(row(page, 'a')).toBeVisible();

    await page.keyboard.press('Shift+U');

    await expect(toast(page, 'Marked 2 as read')).toBeVisible();
    expect(await isUnread(page, 'a')).toBe(false);
    expect(await isUnread(page, 'b')).toBe(false);
    await expect.poll(() => sidebarCount(page)).toBe(0);

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect.poll(() => isUnread(page, 'a')).toBe(true);
    expect(await isUnread(page, 'b')).toBe(true);
    expect(await isUnread(page, 'read-before')).toBe(false);
    expect(server.row('read-before')?.readAt).toBeTruthy();
    await expect.poll(() => sidebarCount(page)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('the button does it too; in the Archived tab it is off, and so is ⇧U', async ({ page, api }) => {
    fakeInbox(api, [notification('a', 1)]);
    await open(page);
    await expect(row(page, 'a')).toBeVisible();

    await page.getByRole('button', { name: /Mark all read/ }).click();
    await expect.poll(() => isUnread(page, 'a')).toBe(false);

    await tab(page, 'Archived').click();
    await expect(page.getByRole('button', { name: /Mark all read/ })).toHaveAttribute('aria-disabled', 'true');

    const readAlls = () => api.requests.filter((r) => new URL(r.url()).pathname === '/notifications/read_all').length;
    const before = readAlls();
    await page.keyboard.press('Shift+U');
    // A request it would send goes out in this frame; give the page one to be sure it did not
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(readAlls()).toBe(before);
  });

  test('a failed read-all is undone and said', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1)]);
    await open(page);
    await expect(row(page, 'a')).toBeVisible();
    server.fail('read_all');

    await page.keyboard.press('Shift+U');

    await expect(toast(page, 'Couldn’t mark all read. Changes were undone.')).toBeVisible();
    expect(await isUnread(page, 'a')).toBe(true);
  });
});

test.describe('pages', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => notification(`n${String(i).padStart(2, '0')}`, i + 1));

  test('the next page comes near the end, and the row count is known once it is the last', async ({ page, api }) => {
    fakeInbox(api, many(45), { pageSize: 30 });
    await open(page);
    await expect(grid(page)).toHaveAttribute('aria-rowcount', '-1');

    await grid(page).focus();
    await page.keyboard.press('End');

    // 45 rows and the Today header
    await expect(grid(page)).toHaveAttribute('aria-rowcount', '46');
    await page.keyboard.press('End');
    await cursorOn(page, 'n44');
  });

  test('a failed next page keeps the list and offers a retry', async ({ page, api }) => {
    const server = fakeInbox(api, many(45), { pageSize: 30 });
    await open(page);
    await expect(row(page, 'n00')).toBeVisible();
    server.fail('list', 2); // the request and React Query's one retry

    await grid(page).focus();
    await page.keyboard.press('End');

    const retry = grid(page).getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(row(page, 'n29')).toBeVisible();

    await retry.click();

    await expect(grid(page)).toHaveAttribute('aria-rowcount', '46');
  });
});

test.describe('loading and errors', () => {
  test('a slow first load shows the skeleton, then the rows', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1)]);
    const release = server.hold('list');
    await open(page);

    await expect(page.getByText('Loading notifications')).toBeAttached();
    release();

    await expect(row(page, 'a')).toBeVisible();
    await expect(page.getByText('Loading notifications')).toHaveCount(0);
  });

  test('a failed first load says so; Retry loads it', async ({ page, api }) => {
    const server = fakeInbox(api, [notification('a', 1)]);
    server.fail('list', 2); // the request and React Query's one retry
    await open(page);

    await expect(page.getByText('Couldn’t load notifications')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(row(page, 'a')).toBeVisible();
  });
});

test('the sidebar Inbox row links to this workspace’s Inbox and counts its unread', async ({ page, api }) => {
  fakeInbox(api, [notification('a', 1), notification('b', 2), notification('elsewhere', 3, { workspaceId: '00000000-0000-0000-0000-0000000000ff' })]);
  await open(page);

  const link = page.getByRole('link', { name: /Inbox/ });
  await expect(link).toHaveAttribute('href', `/${SLUG}/inbox`);
  await expect.poll(() => sidebarCount(page)).toBe(2);
});
