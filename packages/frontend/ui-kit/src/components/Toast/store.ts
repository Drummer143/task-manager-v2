import { create } from 'zustand';
import { raw } from '../../tokens';
import { undoHistory } from '../../interaction/undo';
import { shouldNotify } from './shouldNotify';
import type {
  ActionToast,
  ErrorToastOptions,
  NoticeToast,
  NotifyPolicy,
  ProgressToastHandle,
  ProgressToastOptions,
  ToastNotification,
  UndoToastOptions,
} from './types';

interface ToastState {
  /** The one action toast on screen: undo, progress, error or note. */
  action: ActionToast | null;
  /** The newest one that came while an error was on screen: an error is never pushed out. */
  waiting: ActionToast | null;
  notice: NoticeToast | null;
  /** The notice went because its subject is gone: no exit animation. */
  noticeWithdrawn: boolean;
  lastNoticeAt: number | null;
  policy: NotifyPolicy;
  /** Where toasts stand: the canvas (AppShell registers it); none — the window. */
  area: HTMLElement | null;
}

export const useToastStore = create<ToastState>(() => ({
  action: null,
  waiting: null,
  notice: null,
  noticeWithdrawn: false,
  lastNoticeAt: null,
  policy: () => true,
  area: null,
}));

let sequence = 0;
const nextKey = () => ++sequence;

const { setState, getState } = useToastStore;

/** One at a time: a new toast replaces the current one — except an error, which waits for its decision. */
const show = (item: ActionToast) =>
  setState(({ action }) => (action?.kind === 'error' && item.kind !== 'error' ? { waiting: item } : { action: item }));

/** Changes a toast in place, wherever it is — on screen or waiting behind an error. */
const patch = (key: number, update: (item: ActionToast) => ActionToast) =>
  setState(({ action, waiting }) => ({
    action: action?.key === key ? update(action) : action,
    waiting: waiting?.key === key ? update(waiting) : waiting,
  }));

const close = (key: number) =>
  setState(({ action, waiting }) => {
    if (action?.key === key) {
      return { action: waiting, waiting: null };
    }

    return waiting?.key === key ? { waiting: null } : {};
  });

const opOf = (options: UndoToastOptions) =>
  'op' in options ? options.op : undoHistory.push({ label: options.message, undo: options.undo, redo: options.redo });

const undoItem = (key: number, options: UndoToastOptions): Extract<ActionToast, { kind: 'undo' }> => ({
  kind: 'undo',
  key,
  message: options.message,
  detail: options.detail,
  op: opOf(options),
});

const errorItem = (key: number, options: ErrorToastOptions): ActionToast => ({ kind: 'error', key, ...options });

/**
 * The toasts of the app (spec: Toast) — callable from anywhere, like `palette`.
 * There is no `success` on purpose: success is seen in the result.
 */
export const toast = {
  /** The result of an operation, and a way back for --undo-window. Returns the operation's id in the history. */
  undo(options: UndoToastOptions): string {
    const item = undoItem(nextKey(), options);

    show(item);

    return item.op;
  },

  /** A long operation one may leave the screen during. It becomes an undo or an error in place. */
  progress(options: ProgressToastOptions): ProgressToastHandle {
    const key = nextKey();

    show({ kind: 'progress', key, message: options.message, total: options.total, done: 0, onCancel: options.onCancel });

    return {
      update: (done, message) =>
        patch(key, (item) => (item.kind === 'progress' ? { ...item, done, message: message ?? item.message } : item)),
      succeed: (options) => {
        if (!options) {
          close(key);
          return undefined;
        }

        const item = undoItem(key, options);

        patch(key, () => item);

        return item.op;
      },
      fail: (options) => patch(key, () => errorItem(key, options)),
      dismiss: () => close(key),
    };
  },

  /** An operation whose elements are not on screen failed. Stays until Retry or ×. */
  error(options: ErrorToastOptions) {
    const key = nextKey();

    show(errorItem(key, options));

    return { dismiss: () => close(key) };
  },

  /** A result with no visible trace: "Link copied". --toast-note, no actions. */
  note(message: string) {
    show({ kind: 'note', key: nextKey(), message });
  },

  /**
   * Someone called you. Shown only if the app's policy and the lane's rules
   * allow (`shouldNotify`); otherwise nothing happens — it is in the inbox.
   */
  notify(notification: ToastNotification) {
    const { notice, lastNoticeAt, policy } = getState();
    const decision = shouldNotify({
      allowed: policy(notification),
      tabVisible: typeof document === 'undefined' || document.visibilityState === 'visible',
      showing: notice !== null,
      duplicate: notice?.notification.id === notification.id,
      now: Date.now(),
      lastShownAt: lastNoticeAt,
      gap: raw['notify-gap'],
    });

    if (decision === 'show') {
      setState({
        notice: { key: nextKey(), notification, more: 0 },
        noticeWithdrawn: false,
        lastNoticeAt: Date.now(),
      });
    } else if (decision === 'more' && notice) {
      setState({ notice: { ...notice, more: notice.more + 1 } });
    }
  },

  /** Its subject was deleted or access to it taken away: the notification goes at once. */
  withdraw(subjectId: string) {
    if (getState().notice?.notification.subjectId === subjectId) {
      setState({ notice: null, noticeWithdrawn: true });
    }
  },
};

/** For the host: closing by the timer, ×, Esc, Undo, Retry, Open. */
export const toastControls = {
  close,
  closeNotice: () => setState({ notice: null, noticeWithdrawn: false }),
};
