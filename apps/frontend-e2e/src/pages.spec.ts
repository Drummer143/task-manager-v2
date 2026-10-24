import { WORKSPACE } from './support/api';
import { expect, test } from './support/fixtures';
import { fakePages, page as fakePage } from './support/pages';

/**
 * Pages (pages spec, part 1): the tree in the sidebar, a page opened by its address, a new page
 * from the sidebar's +, the trash.
 */
test.use({ signedIn: true });

const SLUG = WORKSPACE.slug;

const PRODUCT = fakePage('p1', 'Product', { type: 'group' });
const ROADMAP = fakePage('p2', 'Roadmap', { parentId: 'p1' });
const HANDBOOK = fakePage('p3', 'Handbook');

test('the tree shows the pages and opens one with its path above it', async ({ page, api }) => {
  fakePages(api, [PRODUCT, ROADMAP, HANDBOOK]);

  await page.goto(`/${SLUG}/inbox`);
  const tree = page.getByRole('tree', { name: 'Pages' });
  await expect(tree.getByRole('treeitem')).toHaveText(['Product', 'Handbook']);

  await page.goto(`/${SLUG}/p/${ROADMAP.shortId}`);

  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Roadmap');
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumbs' });
  await expect(crumbs.getByRole('listitem')).toHaveText(['Verso team', 'Product', 'Roadmap']);
  // Its ancestors open in the tree
  await expect(tree.getByRole('treeitem', { name: 'Roadmap' })).toBeVisible();
});

test('+ makes a page, opens it with the title to type, and the tree takes the title', async ({ page, api }) => {
  fakePages(api, [HANDBOOK]);

  await page.goto(`/${SLUG}/inbox`);
  await page.getByRole('button', { name: 'New page' }).click();

  const title = page.getByRole('textbox', { name: 'Page title' });
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/p/shortnew1`));
  await expect(title).toBeFocused();

  await title.fill('  Q3 plan ');
  await title.press('Enter');

  const tree = page.getByRole('tree', { name: 'Pages' });
  await expect(tree.getByRole('treeitem')).toHaveText(['Handbook', 'Q3 plan']);
  await expect(title).toHaveValue('Q3 plan');
});

test('a group lists its children, and a trashed page offers Restore', async ({ page, api }) => {
  fakePages(api, [PRODUCT, ROADMAP, fakePage('p4', 'Old', { deletedAt: '2026-10-24T09:00:00Z', deletedRoot: 'p4' })]);

  await page.goto(`/${SLUG}/p/${PRODUCT.shortId}`);
  await expect(page.getByRole('link', { name: 'Roadmap' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'New page' }).last()).toBeVisible();

  await page.goto(`/${SLUG}/p/shortp4xxx`);
  await expect(page.getByText('This page is in Trash')).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();

  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Old');
  await expect(page.getByRole('tree', { name: 'Pages' }).getByRole('treeitem', { name: 'Old' })).toBeVisible();
});
