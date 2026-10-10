import { describe, expect, it } from 'vitest';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import { firstDayOfWeek, groupEntries, groupOf, sortDateOf } from './grouping';

// Wednesday 15 October 2026, 10:00 local time
const NOW = new Date(2026, 9, 14 + 1, 10, 0);
const local = (day: number, hour = 12) => new Date(2026, 9, day, hour);

const notification = (id: string, updatedAt: Date, archivedAt: Date | null = null): Notification =>
  ({
    id,
    kind: 'debug',
    facts: {},
    userId: 'u1',
    readAt: null,
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }) as unknown as Notification;

describe('groupOf', () => {
  it.each([
    ['the same calendar day', local(15, 0), 'today'],
    ['a minute ahead of the clock', new Date(NOW.getTime() + 60_000), 'today'],
    ['the day before, even late at night', local(14, 23), 'yesterday'],
    ['the day before, just after midnight', local(14, 0), 'yesterday'],
    ['Monday of this week', local(12, 9), 'week'],
    ['Sunday before it', local(11, 20), 'earlier'],
  ] as const)('%s', (_, date, group) => {
    expect(groupOf(date, NOW, 1)).toBe(group);
  });

  it('a week starting on Sunday takes that Sunday in', () => {
    expect(groupOf(local(11, 20), NOW, 7)).toBe('week');
    expect(groupOf(local(10, 20), NOW, 7)).toBe('earlier');
  });

  it('on the first day of the week, yesterday is still Yesterday, not this week', () => {
    const monday = new Date(2026, 9, 12, 10);

    expect(groupOf(local(11, 12), monday, 1)).toBe('yesterday');
    expect(groupOf(local(10, 12), monday, 1)).toBe('earlier');
  });
});

describe('groupEntries', () => {
  it('puts a header before each group that has rows, and skips empty groups', () => {
    const list = [
      notification('a', local(15, 9)),
      notification('b', local(15, 8)),
      notification('c', local(9)),
    ];

    expect(groupEntries(list, 'all', NOW, 1).map((entry) => entry.key)).toEqual([
      'group:today',
      'a',
      'b',
      'group:earlier',
      'c',
    ]);
  });

  it('keeps a header when every row is in one group: it answers "when"', () => {
    expect(groupEntries([notification('a', local(15, 9))], 'all', NOW, 1).map((entry) => entry.key)).toEqual([
      'group:today',
      'a',
    ]);
  });

  it('nothing for no rows', () => {
    expect(groupEntries([], 'all', NOW, 1)).toEqual([]);
  });

  it('groups the Archived tab by the archiving date', () => {
    const old = notification('a', local(1), local(15, 9));

    expect(sortDateOf('archived', old)).toEqual(local(15, 9));
    expect(groupEntries([old], 'archived', NOW, 1)[0]).toEqual({ kind: 'group', key: 'group:today', group: 'today' });
    expect(groupEntries([old], 'all', NOW, 1)[0]).toEqual({ kind: 'group', key: 'group:earlier', group: 'earlier' });
  });
});

describe('firstDayOfWeek', () => {
  it('reads the locale, Monday where it cannot tell', () => {
    expect([1, 7]).toContain(firstDayOfWeek('en-US'));
    expect(firstDayOfWeek('not a locale')).toBe(1);
  });
});
