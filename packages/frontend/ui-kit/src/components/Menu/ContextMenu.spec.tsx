import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './types';

const items = (onOpen: () => void = vi.fn()): MenuItem[] => [
  { type: 'action', id: 'open', label: 'Open task', onSelect: onOpen },
  { type: 'action', id: 'status', label: 'Status', keys: 's' },
];

const Card = ({ onOpen, onContextMenu }: { onOpen?: () => void; onContextMenu?: () => void }) => (
  <ContextMenu items={items(onOpen)}>
    <div tabIndex={0} data-testid="card" onContextMenu={onContextMenu}>
      TM-248 · AppShell
    </div>
  </ContextMenu>
);

describe('ContextMenu', () => {
  it('costs nothing until asked: no menu machine, no layer', () => {
    render(<Card />);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.querySelector('[data-scope="menu"]')).toBeNull();
  });

  it('opens on right click, keeping the element’s own handler', async () => {
    const own = vi.fn();
    render(<Card onContextMenu={own} />);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
    act(() => {
      screen.getByTestId('card').dispatchEvent(event);
    });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Open task' })).toBeTruthy();
    expect(own).toHaveBeenCalledTimes(1);
    // The browser's own menu does not open over ours.
    expect(event.defaultPrevented).toBe(true);
  });

  it('opens from the keyboard with Shift+F10 and the menu key, and Esc returns focus to the element', async () => {
    render(<Card />);
    const card = screen.getByTestId('card');

    act(() => card.focus());
    fireEvent.keyDown(card, { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu');

    act(() => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(card));

    fireEvent.keyDown(card, { key: 'ContextMenu' });
    await screen.findByRole('menu');
  });

  it('runs an item like any menu', async () => {
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);

    fireEvent.contextMenu(screen.getByTestId('card'));
    const menu = await screen.findByRole('menu');
    const item = within(menu).getByRole('menuitem', { name: 'Open task' });
    fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
    fireEvent.click(item);

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('never re-creates the element — its DOM node and state survive the first open', async () => {
    render(<Card />);
    const card = screen.getByTestId('card');

    fireEvent.contextMenu(card);
    await screen.findByRole('menu');

    expect(screen.getByTestId('card')).toBe(card);
  });

  it('stays out of the way when the element prevents the context menu itself', () => {
    render(
      <ContextMenu items={items()}>
        <div data-testid="card" onContextMenu={(event) => event.preventDefault()}>
          Card
        </div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('card'));

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
