import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitRoot, toggleSidebar, useShell, type RouterAdapter } from '@task-manager-v2/ui-kit';
import { Sidebar } from './Sidebar';
import { useSidebarHotkeys } from './hotkeys';

vi.hoisted(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

const Harness: React.FC<{ openInbox: () => void }> = ({ openInbox }) => {
  useSidebarHotkeys(openInbox);
  return <Sidebar inbox={{ href: '/inbox', unread: 3 }} />;
};

let view: () => string = () => 'expanded';
const ViewProbe: React.FC = () => {
  const { sidebarView } = useShell();
  view = () => sidebarView;
  return null;
};

const setup = () => {
  const router: RouterAdapter = { navigate: vi.fn() };
  const openInbox = vi.fn();
  render(
    <KitRoot router={router}>
      <Harness openInbox={openInbox} />
      <ViewProbe />
    </KitRoot>,
  );

  return { openInbox };
};

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });

afterEach(() => {
  if (view() === 'collapsed') {
    act(() => toggleSidebar());
  }
});

describe('Sidebar', () => {
  it('expanded: ⇤ in the header and the Inbox row with its count', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Inbox, 3 unread' }).textContent).toContain('Inbox');
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
  });

  it('⇤ collapses it to the rail, ⇥ brings it back; focus stays on the toggle', () => {
    setup();
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    act(() => collapse.focus());

    fireEvent.click(collapse);

    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(view()).toBe('collapsed');
    expect(document.activeElement).toBe(expand);
    expect(screen.getByRole('link', { name: 'Inbox, 3 unread' }).textContent).toBe('');

    fireEvent.click(expand);

    expect(view()).toBe('expanded');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse sidebar' }));
  });

  it('a row that is in both views keeps focus across the switch', () => {
    setup();
    act(() => screen.getByRole('link', { name: 'Inbox, 3 unread' }).focus());

    act(() => toggleSidebar());

    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Inbox, 3 unread' }));
  });

  it('focus elsewhere in the page is left where it is', () => {
    setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => outside.focus());

    act(() => toggleSidebar());

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('Ctrl+\\ and ⌘\\ toggle it; G I opens Inbox', () => {
    const { openInbox } = setup();

    press('\\', { ctrlKey: true });
    expect(view()).toBe('collapsed');
    press('\\', { metaKey: true });
    expect(view()).toBe('expanded');

    press('g');
    press('i');
    expect(openInbox).toHaveBeenCalledTimes(1);
  });

  it('the hotkeys stay out of fields', () => {
    setup();
    const field = document.createElement('input');
    document.body.appendChild(field);

    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true }));
    });

    expect(view()).toBe('expanded');
    field.remove();
  });
});
