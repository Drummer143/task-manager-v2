import React, { useCallback, useMemo } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitRoot, useCursorStore } from '@task-manager-v2/ui-kit';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import { InboxList, inboxRowId } from './InboxList';
import { InboxRow, type InboxRowHandlers } from './InboxRow';
import { groupEntries } from '../grouping';

// jsdom has no layout, so the real VirtualList would render no rows: a plain list stands in
vi.mock('@task-manager-v2/ui-kit', async (importOriginal) => {
  const kit = await importOriginal<typeof import('@task-manager-v2/ui-kit')>();

  // Keeps what the semantics are about: a rowgroup of presentational wrappers in the rows mode
  const PlainList = <Item,>({
    data,
    renderItem,
    getKey,
    semantics = 'list',
  }: {
    data: readonly Item[];
    renderItem(item: Item, index: number): React.ReactNode;
    getKey(item: Item): React.Key;
    semantics?: 'list' | 'rows';
  }) => (
    <div role={semantics === 'rows' ? 'rowgroup' : 'list'}>
      {data.map((item, index) => (
        <React.Fragment key={getKey(item)}>{renderItem(item, index)}</React.Fragment>
      ))}
    </div>
  );

  return { ...kit, VirtualList: PlainList };
});

// Counts its renders per row: the point of the memo and the boolean cursor selector
const rowRenders = vi.hoisted(() => new Map<string, number>());

vi.mock('../../../shared/ui/NotificationRow', () => ({
  NotificationRow: ({ id, cursor, rowIndex }: { id: string; cursor?: boolean; rowIndex?: number }) => {
    rowRenders.set(id, (rowRenders.get(id) ?? 0) + 1);
    return <div role="row" id={id} aria-rowindex={rowIndex} data-cursor={cursor ? '' : undefined} />;
  },
}));

// Local times: the groups are calendar days in the user's time zone
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString();

const notification = (id: string, day = at(9)): Notification =>
  ({
    id,
    kind: 'debug',
    userId: 'u1',
    facts: { message: `Message ${id}` },
    readAt: null,
    archivedAt: null,
    createdAt: '2026-10-09T10:00:00Z',
    updatedAt: day,
  }) as unknown as Notification;

const ITEMS = ['n1', 'n2', 'n3', 'n4'].map((id) => notification(id));
// All four on one day: one header before them
const NOW = new Date(2026, 9, 9, 18);

/** The page's side, as in Inbox.tsx: stable handlers, renderItem of InboxRow. */
const Page: React.FC<{ items?: readonly Notification[]; hasMore?: boolean }> = ({ items = ITEMS, hasMore }) => {
  const handlers = useMemo<InboxRowHandlers>(
    () => ({ markAsRead: vi.fn(), markAsUnread: vi.fn(), archive: vi.fn(), unarchive: vi.fn() }),
    [],
  );
  const renderItem = useCallback(
    (item: Notification, index: number) => <InboxRow item={item} index={index} handlers={handlers} />,
    [handlers],
  );

  return (
    <KitRoot>
      <InboxList
        entries={groupEntries(items, 'all', NOW, 1)}
        renderItem={renderItem}
        hasMore={hasMore}
        onEndReached={vi.fn()}
      />
    </KitRoot>
  );
};

const grid = () => screen.getByRole('grid', { name: 'Notifications' });
const cursor = () => useCursorStore.getState().cursor;
const cursorRow = () => grid().getAttribute('aria-activedescendant');
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });

beforeEach(() => {
  rowRenders.clear();
  useCursorStore.getState().clearCursor();
});

afterEach(() => {
  useCursorStore.getState().clearCursor();
});

describe('InboxList', () => {
  it('is one Tab stop; the cursor starts on the first row and is named by aria-activedescendant', () => {
    render(<Page />);

    expect(grid().tabIndex).toBe(0);
    expect(cursor()).toBe('n1');
    expect(cursorRow()).toBe(inboxRowId('n1'));
    expect(document.getElementById(inboxRowId('n1'))?.hasAttribute('data-cursor')).toBe(true);
  });

  it('its rows belong to the grid: VirtualList is a rowgroup, not a list inside it', () => {
    render(<Page />);

    // The rows and the group's header
    expect(grid().querySelectorAll('[role="rowgroup"] [role="row"]')).toHaveLength(ITEMS.length + 1);
    expect(grid().querySelector('[role="list"]')).toBeNull();
  });

  it('each row tells its place in the whole list; the grid its row count, or -1 while more pages come', () => {
    const { rerender } = render(<Page hasMore />);

    // The header is row 1: the places count it
    expect(screen.getAllByRole('row').map((row) => row.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3', '4', '5']);
    expect(grid().getAttribute('aria-rowcount')).toBe('-1');

    rerender(<Page />);
    expect(grid().getAttribute('aria-rowcount')).toBe('5');
  });

  it('J / K move it anywhere on the page, and stop at the ends', () => {
    render(<Page />);

    press('j');
    press('j');
    expect(cursor()).toBe('n3');

    press('k');
    press('k');
    press('k');
    expect(cursor()).toBe('n1');
  });

  it('arrows move it anywhere on the page, like J / K', () => {
    render(<Page />);

    press('ArrowDown');
    press('ArrowDown');
    expect(cursor()).toBe('n3');

    press('ArrowUp');
    expect(cursor()).toBe('n2');
  });

  it('an arrow a widget already took (a radio group, a menu) does not move it', () => {
    render(<Page />);
    const radios = document.createElement('div');
    radios.addEventListener('keydown', (event) => event.preventDefault());
    document.body.append(radios);

    act(() => {
      radios.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });

    expect(cursor()).toBe('n1');
    radios.remove();
  });

  it('Home and End jump to the ends only while the list has focus', () => {
    render(<Page />);

    fireEvent.keyDown(document.body, { key: 'End' });
    expect(cursor()).toBe('n1');

    fireEvent.keyDown(grid(), { key: 'End' });
    expect(cursor()).toBe('n4');
    fireEvent.keyDown(grid(), { key: 'Home' });
    expect(cursor()).toBe('n1');
  });

  it('a move re-renders only the row it leaves and the row it lands on', () => {
    render(<Page />);
    rowRenders.clear();

    press('j');

    expect(Object.fromEntries(rowRenders)).toEqual({ [inboxRowId('n1')]: 1, [inboxRowId('n2')]: 1 });
  });

  it('it stays on its notification when new ones come on top', () => {
    const { rerender } = render(<Page />);
    press('j');

    rerender(<Page items={[notification('n0'), ...ITEMS]} />);

    expect(cursor()).toBe('n2');
  });

  it('a cursor on a row that is gone goes to the first row', () => {
    const { rerender } = render(<Page />);
    press('j');

    rerender(<Page items={ITEMS.filter((item) => item.id !== 'n2')} />);

    expect(cursor()).toBe('n1');
  });

  it('groups get a header row the cursor steps over', () => {
    render(<Page items={[notification('n1', at(9)), notification('n2', at(1))]} />);

    expect(screen.getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Today', 'Earlier']);

    press('j');
    expect(cursor()).toBe('n2');
    press('k');
    expect(cursor()).toBe('n1');
  });

  it('a click on a header moves nothing', () => {
    render(<Page />);
    press('j');

    fireEvent.mouseDown(screen.getByRole('rowheader'));

    expect(cursor()).toBe('n2');
  });

  it('a click puts the cursor on the row and gives the list focus', () => {
    render(<Page />);

    fireEvent.mouseDown(document.getElementById(inboxRowId('n3')) as HTMLElement);

    expect(cursor()).toBe('n3');
    expect(document.activeElement).toBe(grid());
  });
});
