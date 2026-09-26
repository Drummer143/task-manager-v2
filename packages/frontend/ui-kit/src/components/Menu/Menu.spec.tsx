import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';
import type { MenuItem } from './types';
import { Button } from '../Button';
import { KitRoot } from '../KitRoot';
import { Popover } from '../Popover';
import { useEscapeStack } from '../../interaction/escape';
import { getHotkeyCombinationString, useHotkeysStore } from '../../interaction/hotkeys';
import { raw } from '../../tokens';
import styles from './Menu.module.scss';

const icon = <svg data-testid="icon" />;

const menu = () => screen.queryByRole('menu');
const ITEM_ROLES = ['menuitem', 'menuitemcheckbox', 'menuitemradio'] as const;
/** An item of the (first) open menu, whatever kind it is. */
const item = (name: string | RegExp) => {
  const content = screen.getAllByRole('menu')[0];

  for (const role of ITEM_ROLES) {
    const found = within(content).queryByRole(role, { name });

    if (found) {
      return found;
    }
  }

  throw new Error(`No menu item named ${String(name)}`);
};
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    screen.getByRole('menu').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });

/** A real press: Zag takes a click on an item only after a pointerdown on it (no click-through from the trigger). */
const choose = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(element, { pointerType: 'mouse', button: 0 });
  fireEvent.click(element);
};

const open = async (name = 'Actions') => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('menu');
};

describe('Menu · opening', () => {
  it('opens from its trigger, which holds the pressed look through aria-expanded', async () => {
    render(<Menu items={[{ type: 'action', id: 'a', label: 'Status' }]} trigger={<Button>Actions</Button>} />);
    const trigger = screen.getByRole('button', { name: 'Actions' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();

    await open();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('is on the default surface, in a portal, marked as a layer', async () => {
    const { container } = render(<Menu items={[{ type: 'action', id: 'a', label: 'Status' }]} trigger={<Button>Actions</Button>} />);

    const content = await open();

    expect(container.contains(content)).toBe(false);
    expect(content.getAttribute('data-surface')).toBe('default');
    expect(content.parentElement?.hasAttribute('data-layer')).toBe(true);
  });
});

describe('Menu · items', () => {
  const ITEMS: MenuItem[] = [
    { type: 'label', label: 'Task TM-248' },
    { type: 'action', id: 'status', label: 'Status', icon, keys: 's' },
    { type: 'action', id: 'move', label: 'Move to workspace', disabledReason: 'Only the owner can move it' },
    { type: 'action', id: 'dup', label: 'Duplicate', description: 'Without comments' },
    { type: 'separator' },
    { type: 'action', id: 'delete', label: 'Delete', danger: true, keys: 'mod+backspace' },
  ];

  it('renders groups with labels, separators, hotkeys and descriptions', async () => {
    render(<Menu items={ITEMS} trigger={<Button>Actions</Button>} />);
    const content = await open();

    expect(within(content).getByRole('group', { name: 'Task TM-248' })).toBeTruthy();
    expect(within(content).getAllByRole('separator')).toHaveLength(1);
    expect(item(/Status/).querySelector('kbd')?.getAttribute('data-variant')).toBe('inline');
    expect(item(/Duplicate/).textContent).toContain('Without comments');
    expect(item(/Delete/).classList.contains(styles.danger)).toBe(true);
  });

  it('keeps an unavailable item in place, dimmed, with its reason in a tooltip', async () => {
    const onSelect = vi.fn();
    render(<Menu items={[{ type: 'action', id: 'move', label: 'Move', disabledReason: 'Only the owner', onSelect }]} trigger={<Button>Actions</Button>} />);
    await open();

    choose(item('Move'));

    expect(item('Move').hasAttribute('data-disabled')).toBe(true);
    expect(item('Move').getAttribute('data-tooltip-reason')).toBe('Only the owner');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reserves the icon slot only when something uses it', async () => {
    const view = render(<Menu items={[{ type: 'action', id: 'a', label: 'Rename' }]} trigger={<Button>Actions</Button>} />);
    await open();
    expect(item('Rename').querySelector(`.${styles.slot}`)).toBeNull();

    view.unmount();
    render(
      <Menu
        items={[
          { type: 'action', id: 'a', label: 'Rename' },
          { type: 'action', id: 'b', label: 'Status', icon },
        ]}
        trigger={<Button>Actions</Button>}
      />,
    );
    await open();
    expect(item('Rename').querySelector(`.${styles.slot}`)).not.toBeNull();
  });
});

describe('Menu · choosing', () => {
  it('runs an action and closes in the same frame', async () => {
    const onSelect = vi.fn();
    render(<Menu items={[{ type: 'action', id: 'a', label: 'Status', onSelect }]} trigger={<Button>Actions</Button>} />);
    await open();

    choose(item('Status'));

    // Zag handles the press in a microtask — the same frame for the user.
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(menu()).toBeNull());
  });

  it('runs an item by its hotkey while open — a letter wins over typeahead', async () => {
    const status = vi.fn();
    const search = vi.fn();
    render(
      <Menu
        items={[
          { type: 'action', id: 'search', label: 'Search', onSelect: search },
          { type: 'action', id: 'status', label: 'Status', keys: 's', onSelect: status },
        ]}
        trigger={<Button>Actions</Button>}
      />,
    );
    await open();

    key('s');

    expect(status).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(menu()).toBeNull());
  });

  it("takes the item's hotkey for itself — the app's same global hotkey does not fire too", async () => {
    const appStatus = vi.fn();
    const menuStatus = vi.fn();
    const config = { key: 's', callback: appStatus, description: 'Status of the cursor task' };
    const unregister = useHotkeysStore.getState().registerHotkey(getHotkeyCombinationString(config), config);
    render(
      <KitRoot>
        <Menu items={[{ type: 'action', id: 'status', label: 'Status', keys: 's', onSelect: menuStatus }]} trigger={<Button>Actions</Button>} />
      </KitRoot>,
    );
    await open();

    key('s');

    expect(menuStatus).toHaveBeenCalledTimes(1);
    expect(appStatus).not.toHaveBeenCalled();
    unregister();
  });

  it('toggles a checkbox item without closing', async () => {
    const Owner = () => {
      const [watching, setWatching] = useState(false);

      return (
        <Menu
          items={[{ type: 'checkbox', id: 'watch', label: 'Watch', checked: watching, onCheckedChange: setWatching }]}
          trigger={<Button>Actions</Button>}
        />
      );
    };
    render(<Owner />);
    await open();

    choose(item('Watch'));

    await waitFor(() => expect(item('Watch').getAttribute('aria-checked')).toBe('true'));
    expect(menu()).not.toBeNull();
  });

  it('chooses a radio option and closes', async () => {
    const onValueChange = vi.fn();
    render(
      <Menu
        items={[
          {
            type: 'radio-group',
            id: 'sort',
            label: 'Sort',
            value: 'due',
            onValueChange,
            options: [
              { value: 'due', label: 'By due date' },
              { value: 'priority', label: 'By priority' },
            ],
          },
        ]}
        trigger={<Button>Actions</Button>}
      />,
    );
    const content = await open();

    expect(within(content).getByRole('group', { name: 'Sort' })).toBeTruthy();
    expect(item('By due date').getAttribute('aria-checked')).toBe('true');

    choose(item('By priority'));

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('priority'));
    await waitFor(() => expect(menu()).toBeNull());
  });

  it('shows the choice of an option with its own sign as a check at the right', async () => {
    render(
      <Menu
        items={[
          {
            type: 'radio-group',
            id: 'status',
            value: 'done',
            onValueChange: vi.fn(),
            options: [
              { value: 'progress', label: 'In progress', icon: <span data-testid="dot" /> },
              { value: 'done', label: 'Done', icon: <span /> },
            ],
          },
        ]}
        trigger={<Button>Actions</Button>}
      />,
    );
    await open();

    expect(item('Done').lastElementChild?.classList.contains(styles.trailing)).toBe(true);
    expect(item('In progress').querySelector(`.${styles.trailing}`)).toBeNull();
    expect(screen.getByTestId('dot').parentElement?.classList.contains(styles.slot)).toBe(true);
  });
});

describe('Menu · async items', () => {
  it('waits in the open menu: busy at once, the spinner after its delay, the error on the spot; Enter retries', async () => {
    let settle: { resolve: () => void; reject: (reason: Error) => void } | undefined;
    const onSelect = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    );
    render(
      <KitRoot messages={{ menuRetryHint: 'Enter — ещё раз' }}>
        <Menu items={[{ type: 'action', id: 'link', label: 'Create guest link', icon, onSelect }]} trigger={<Button>Actions</Button>} />
      </KitRoot>,
    );
    await open();

    choose(item(/Create guest link/));

    await waitFor(() => expect(item(/Create guest link/).getAttribute('aria-busy')).toBe('true'));
    expect(menu()).not.toBeNull();

    // A repeated choice of a busy item is ignored.
    choose(item(/Create guest link/));
    await act(async () => undefined);
    expect(onSelect).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(item(/Create guest link/).querySelector('[role="status"]')).not.toBeNull(), {
      timeout: raw['spinner-delay'] * 3,
    });

    await act(async () => settle?.reject(new Error('Failed: offline')));

    expect(item(/Create guest link/).textContent).toContain('Failed: offline · Enter — ещё раз');
    expect(menu()).not.toBeNull();

    choose(item(/Create guest link/));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2));
    await act(async () => settle?.resolve());

    await waitFor(() => expect(menu()).toBeNull());
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('Menu · closing', () => {
  it('closes by Esc, returns focus to the trigger — and the Esc ladder takes no second step', async () => {
    const ladderStep = vi.fn(() => true);
    const Screen = () => {
      useEscapeStack(ladderStep);

      return <Menu items={[{ type: 'action', id: 'a', label: 'Status' }]} trigger={<Button>Actions</Button>} />;
    };
    render(
      <KitRoot>
        <Screen />
      </KitRoot>,
    );
    await open();

    key('Escape');

    await waitFor(() => expect(menu()).toBeNull());
    expect(ladderStep).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions' })));
  });

  it('is one overlay at a time with the popover', async () => {
    render(
      <>
        <Menu items={[{ type: 'action', id: 'a', label: 'Status' }]} trigger={<Button>Actions</Button>} />
        <Popover aria-label="Filters" trigger={<Button>Filters</Button>}>
          Filters
        </Popover>
      </>,
    );
    await open();

    act(() => screen.getByRole('button', { name: 'Filters' }).click());

    await screen.findByRole('dialog', { name: 'Filters' });
    await waitFor(() => expect(menu()).toBeNull());
  });
});

describe('Menu · submenu', () => {
  it('opens with → and runs its action, closing the whole menu', async () => {
    const tomorrow = vi.fn();
    render(
      <Menu
        items={[
          {
            type: 'submenu',
            id: 'due',
            label: 'Due date',
            items: [
              { type: 'action', id: 'today', label: 'Today' },
              { type: 'action', id: 'tomorrow', label: 'Tomorrow', onSelect: tomorrow },
            ],
          },
        ]}
        trigger={<Button>Actions</Button>}
      />,
    );
    await open();

    key('ArrowDown');
    await waitFor(() => expect(item('Due date').hasAttribute('data-highlighted')).toBe(true));
    key('ArrowRight');

    const submenu = await waitFor(() => {
      const menus = screen.getAllByRole('menu');
      expect(menus).toHaveLength(2);
      return menus[1];
    });
    choose(within(submenu).getByRole('menuitem', { name: 'Tomorrow' }));

    await waitFor(() => expect(tomorrow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0));
  });
});

describe('Menu · links', () => {
  it('renders a link item as a link through the router adapter', async () => {
    render(
      <KitRoot router={{ navigate: vi.fn(), useHref: (href) => `/app${href}` }}>
        <Menu items={[{ type: 'action', id: 'open', label: 'Open board', href: '/board' }]} trigger={<Button>Actions</Button>} />
      </KitRoot>,
    );
    await open();

    expect(item('Open board').tagName).toBe('A');
    expect(item('Open board').getAttribute('href')).toBe('/app/board');
  });
});
