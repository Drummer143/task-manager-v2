import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const LOCALE = 'en';

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
const full = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export interface NotificationTime {
  /** In the row: '14m', '3h', 'Yesterday', 'Mon', 'Sep 22'. */
  short: string;
  /** For readers: '14 minutes ago', 'yesterday'. */
  spoken: string;
  /** The tooltip: the full date and time. */
  full: string;
}

/**
 * The row's time (spec: Inbox · 02): within an hour in minutes, today in
 * hours, then yesterday, a weekday within the week, a date before that (with
 * the year once it is not this one). Day borders are the user's local ones.
 */
export const formatNotificationTime = (time: Date, now: Date): NotificationTime => {
  const ago = Math.max(0, now.getTime() - time.getTime());
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);

  let short: string;
  let spoken: string;

  if (ago < HOUR) {
    const minutes = Math.max(1, Math.floor(ago / MINUTE));
    short = `${minutes}m`;
    spoken = relative.format(-minutes, 'minute');
  } else if (days === 0) {
    const hours = Math.floor(ago / HOUR);
    short = `${hours}h`;
    spoken = relative.format(-hours, 'hour');
  } else if (days === 1) {
    short = 'Yesterday';
    spoken = 'yesterday';
  } else if (days < 7) {
    short = weekday.format(time);
    spoken = relative.format(-days, 'day');
  } else {
    short = (time.getFullYear() === now.getFullYear() ? monthDay : monthDayYear).format(time);
    spoken = short;
  }

  return { short, spoken, full: full.format(time) };
};

let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

const tick = () => {
  now = new Date();
  listeners.forEach((listener) => listener());
  timer = setTimeout(tick, MINUTE - (now.getTime() % MINUTE));
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    now = new Date();
    timer = setTimeout(tick, MINUTE - (now.getTime() % MINUTE));
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
    }
  };
};

export const useMinuteClock = () => useSyncExternalStore(subscribe, () => now);
