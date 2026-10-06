import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitRoot, toggleSidebar, type MenuItem, type RouterAdapter } from '@task-manager-v2/ui-kit';
import { NavItem, type NavItemProps } from './NavItem';

// The frame reads the window's width once, on import: jsdom's 1024 is under the 1100 at which
// the sidebar collapses by itself. A wide window, so the rail is only what a test asks for.
// vi.hoisted runs before the imports above, whatever its place in the file
vi.hoisted(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

const MENU: MenuItem[] = [{ type: 'action', id: 'rename', label: 'Rename' }];

const setup = (props: Partial<NavItemProps> = {}) => {
  const router: RouterAdapter = { navigate: vi.fn() };
  render(
    <KitRoot router={router}>
      <NavItem href="/inbox" icon={<svg />} label="Inbox" {...props} />
    </KitRoot>,
  );

  return { router, link: screen.getByRole('link') };
};

/** The sidebar as a rail for one test; afterEach puts it back. */
let railed = false;
const asRail = () => {
  railed = true;
  act(() => toggleSidebar());
};

afterEach(() => {
  if (railed) {
    railed = false;
    act(() => toggleSidebar());
  }
});

describe('NavItem', () => {
  it('the whole row is the link to its page', () => {
    const { router, link } = setup();

    fireEvent.click(link);

    expect(link.getAttribute('href')).toBe('/inbox');
    expect(router.navigate).toHaveBeenCalledWith('/inbox', { replace: undefined });
  });

  it('the current page is marked for readers', () => {
    const { link } = setup({ current: true });

    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it.each([
    [0, null, 'Inbox'],
    [12, '12', 'Inbox, 12 unread'],
    [240, '99+', 'Inbox, 240 unread'],
  ])('count %i: shows %s, reads "%s"', (count, shown, name) => {
    const { link } = setup({ count });

    expect(screen.queryByText(/^\d+\+?$/)?.textContent ?? null).toBe(shown);
    expect(screen.getByRole('link', { name })).toBe(link);
  });

  it('a dot says "updated"; a count wins over it', () => {
    const { link } = setup({ dot: true, label: 'Roadmap notes' });
    expect(link.getAttribute('aria-label')).toBe('Roadmap notes, updated');
  });

  it('the ⋯ opens the row’s menu, is no Tab stop, and does not open the page', async () => {
    const { router } = setup({ menu: MENU });
    const more = screen.getByRole('button', { name: 'More' });

    expect(more.tabIndex).toBe(-1);
    fireEvent.click(more);

    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('the menu opens from the keyboard too: Shift+F10 on the row', async () => {
    const { link } = setup({ menu: MENU });

    fireEvent.keyDown(link, { key: 'F10', shiftKey: true });

    expect(await screen.findByRole('menu')).toBeTruthy();
  });

  describe('on the rail', () => {
    it('only the icon stays; name, count and hotkey go to a tooltip at the right', () => {
      asRail();
      const { link } = setup({ count: 12, keys: 'g i' });

      expect(screen.queryByText('Inbox')).toBeNull();
      expect(screen.queryByText('12')).toBeNull();
      expect(link.getAttribute('aria-label')).toBe('Inbox, 12 unread');
      expect(link.getAttribute('data-tooltip')).toBe('Inbox · 12 unread');
      expect(link.getAttribute('data-tooltip-keys')).toBe('g i');
      expect(link.getAttribute('data-tooltip-placement')).toBe('right');
    });

    it('has no ⋯: the rail has no room for row actions', () => {
      asRail();
      setup({ menu: MENU });

      expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    });
  });
});
