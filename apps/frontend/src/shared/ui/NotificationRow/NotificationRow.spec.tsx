import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitRoot, type RouterAdapter } from '@task-manager-v2/ui-kit';
import { NotificationRow, type NotificationRowProps } from './NotificationRow';
import { formatNotificationTime } from './time';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = new Date(2026, 9, 8, 15, 0); // Thu 8 Oct 2026, 15:00 local

const setup = (props: Partial<NotificationRowProps> = {}) => {
  const router: RouterAdapter = { navigate: vi.fn() };
  const onArchive = vi.fn();
  render(
    <KitRoot router={router}>
      <div role="grid" aria-label="Inbox">
        <NotificationRow
          id="n1"
          href="/inbox?view=unread&task=TM-248"
          unread
          avatar={<span />}
          title="Mira Sato mentioned you"
          context="in TM-248: Can we reuse the undo toast here?"
          time={new Date(NOW.getTime() - 2 * 60_000)}
          actions={[{ icon: <svg />, label: 'Archive', keys: 'e', onClick: onArchive }]}
          {...props}
        />
      </div>
    </KitRoot>,
  );

  // `null` only for a row rendered without `href`
  const link = screen.queryByRole('link') as HTMLElement;

  return { router, onArchive, row: screen.getByRole('row'), link };
};

describe('formatNotificationTime (spec 02)', () => {
  const at = (date: Date) => formatNotificationTime(date, NOW).short;

  it.each([
    ['now: a minute at least', new Date(2026, 9, 8, 14, 59, 50), '1m'],
    ['within an hour, in minutes', new Date(2026, 9, 8, 14, 46), '14m'],
    ['today, in hours', new Date(2026, 9, 8, 12, 0), '3h'],
    ['just after midnight, still in hours', new Date(2026, 9, 8, 0, 5), '14h'],
    ['yesterday, even an hour ago across midnight', new Date(2026, 9, 7, 23, 30), 'Yesterday'],
    ['within the week, the weekday', new Date(2026, 9, 5, 9, 0), 'Mon'],
    ['older, the date', new Date(2026, 8, 22, 9, 0), 'Sep 22'],
    ['another year, with the year', new Date(2025, 11, 30, 9, 0), 'Dec 30, 2025'],
  ])('%s', (_, date, expected) => {
    expect(at(date)).toBe(expected);
  });

  it('a minute before midnight yesterday is "Yesterday", not "15h"', () => {
    expect(at(new Date(2026, 9, 7, 0, 1))).toBe('Yesterday');
  });

  it('says it in words for readers', () => {
    expect(formatNotificationTime(new Date(2026, 9, 8, 14, 58), NOW).spoken).toBe('2 minutes ago');
    expect(formatNotificationTime(new Date(2026, 9, 7, 9, 0), NOW).spoken).toBe('yesterday');
  });
});

describe('NotificationRow', () => {
  it('is a row of the grid with one cell, named for the list’s aria-activedescendant', () => {
    const { row } = setup();

    expect(row.id).toBe('n1');
    expect(screen.getAllByRole('gridcell')).toHaveLength(1);
  });

  it('reads as one phrase: unread, who, where, when', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const { row } = setup({ count: 5 });

    expect(row.textContent?.replace(/\s+/g, ' ')).toContain(
      'Unread. Mira Sato mentioned you in TM-248: Can we reuse the undo toast here?, 5 updates, 2 minutes ago',
    );
  });

  it('the whole row opens it in the panel, replacing the history entry', () => {
    const { router, link } = setup();

    fireEvent.click(link);

    expect(router.navigate).toHaveBeenCalledWith('/inbox?view=unread&task=TM-248', { replace: true });
  });

  it('without an href it is not a link, keeps its content, and a click navigates nowhere', () => {
    const { router, link, row } = setup({ href: undefined });

    expect(link).toBeNull();
    expect(row.textContent).toContain('Mira Sato mentioned you');

    fireEvent.click(screen.getByText('Mira Sato mentioned you'));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('nothing in it is a Tab stop, and a click does not take the list’s focus', () => {
    const { row, link } = setup();
    const button = screen.getByRole('button', { name: 'Archive' });

    expect(link.tabIndex).toBe(-1);
    expect(button.tabIndex).toBe(-1);
    expect(fireEvent.mouseDown(row)).toBe(false); // default prevented: focus stays where it was
  });

  it('an action runs without opening the row', () => {
    const { router, onArchive } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('the folded count shows only past one event', () => {
    setup({ count: 1 });
    expect(screen.queryByText('1')).toBeNull();
  });

  it('marks its state for the styles', () => {
    const { row } = setup({ cursor: true, opened: true, gone: true });

    expect(row.hasAttribute('data-cursor')).toBe(true);
    expect(row.hasAttribute('data-opened')).toBe(true);
    expect(row.hasAttribute('data-gone')).toBe(true);
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('dims a pending change only once it takes a while', () => {
    vi.useFakeTimers();
    const { row } = setup({ pending: true });

    expect(row.hasAttribute('data-pending')).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(row.hasAttribute('data-pending')).toBe(true);
  });
});
