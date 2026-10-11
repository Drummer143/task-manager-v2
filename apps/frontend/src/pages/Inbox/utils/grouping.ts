import type {
  ListNotificationsView,
  Notification,
} from '@task-manager-v2/api/main/schemas';

import { sortDateOf } from '../../../shared/inbox/sortDate';

export { sortDateOf };

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
  | { kind: 'row'; key: string; item: Notification }
  /** The pinned group failed to load: its line under the Account header, with Retry. */
  | { kind: 'pinnedError'; key: string };

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
  pinnedFailed = false,
): InboxEntry[] => {
  const entries: InboxEntry[] = [];
  let current: InboxGroup | null = null;

  if (pinned.length > 0 || pinnedFailed) {
    entries.push({ kind: 'group', key: 'group:account', group: 'account' });
    pinned.forEach((item) => entries.push({ kind: 'row', key: item.id, item }));
  }

  // The rest of the list stays: a section's error stays in the section (spec: States · 03)
  if (pinnedFailed) {
    entries.push({ kind: 'pinnedError', key: 'account:error' });
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
