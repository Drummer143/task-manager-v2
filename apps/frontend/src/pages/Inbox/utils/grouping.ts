import type {
  ListNotificationsView,
  Notification,
} from '@task-manager-v2/api/main/schemas';

/**
 * The date a notification is ordered and grouped by (spec 04): when it last changed, in the
 * Archived tab when it was archived. One function for both, or groups would interleave.
 */
export const sortDateOf = (view: ListNotificationsView, n: Notification) =>
  new Date(view === 'archived' ? (n.archivedAt ?? n.updatedAt) : n.updatedAt);

export type InboxGroup = 'account' | 'today' | 'yesterday' | 'week' | 'earlier';

export const GROUP_LABELS: Record<InboxGroup, string> = {
  account: 'Account',
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  earlier: 'Earlier',
};

export type InboxEntry =
  | { kind: 'group'; key: string; group: InboxGroup }
  | { kind: 'row'; key: string; item: Notification };

/** 1 — Monday … 7 — Sunday, as `Intl.Locale#getWeekInfo` counts. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type WeekInfoLocale = Intl.Locale & {
  getWeekInfo?(): { firstDay: Weekday };
  weekInfo?: { firstDay: Weekday };
};

/** The locale's first day of the week; Monday where the browser cannot tell. */
export const firstDayOfWeek = (locale = navigator.language): Weekday => {
  try {
    const info = new Intl.Locale(locale) as WeekInfoLocale;

    return (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
  } catch {
    return 1;
  }
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Calendar days in the user's time zone (local `Date`), not 24-hour spans. */
export const groupOf = (
  date: Date,
  now: Date,
  weekStart: Weekday,
): InboxGroup => {
  const today = startOfDay(now);

  // A clock a little ahead on the server is still today
  if (date >= today) return 'today';
  if (date >= addDays(today, -1)) return 'yesterday';

  // getDay: 0 — Sunday; Weekday: 7 — Sunday
  const daysIntoWeek = (today.getDay() - (weekStart % 7) + 7) % 7;

  return date >= addDays(today, -daysIntoWeek) ? 'week' : 'earlier';
};

/**
 * The list as it is shown: the pinned Account group first, if it has rows, then a header before
 * each time group that has rows, also when there is only one (it answers "when"). The list comes
 * sorted by `sortDateOf`, so a group never repeats.
 */
export const groupEntries = (
  list: readonly Notification[],
  view: ListNotificationsView,
  now: Date,
  weekStart: Weekday,
  pinned: readonly Notification[] = [],
): InboxEntry[] => {
  const entries: InboxEntry[] = [];
  let current: InboxGroup | null = null;

  if (pinned.length > 0) {
    entries.push({ kind: 'group', key: 'group:account', group: 'account' });
    pinned.forEach((item) => entries.push({ kind: 'row', key: item.id, item }));
  }

  for (const item of list) {
    const group = groupOf(sortDateOf(view, item), now, weekStart);

    if (group !== current) {
      current = group;
      entries.push({ kind: 'group', key: `group:${group}`, group });
    }

    entries.push({ kind: 'row', key: item.id, item });
  }

  return entries;
};
