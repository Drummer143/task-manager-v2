import type React from 'react';
import type { UndoOperation } from '../../interaction/undo';

export interface ToastAction {
  label: string;
  onAction(): void;
}

/**
 * The result of an operation that can be undone (spec: Toast · 01). Either an
 * operation already in the undo history (`op`), or one to record there now.
 */
export type UndoToastOptions = {
  /** The result, not the process: "3 tasks moved to Done". */
  message: string;
  /** One more line, meta-sized: "With 12 tasks". */
  detail?: string;
} & ({ op: string } | Pick<UndoOperation, 'undo' | 'redo'>);

export interface ProgressToastOptions {
  message: string;
  /** How many steps in all: the bar is determinate, the message counts. */
  total?: number;
  /** A long operation one may stop; what is done so far stays (and is undone by mod+Z). */
  onCancel?(): void;
}

export interface ErrorToastOptions {
  /** How many of how many failed, and what: "Couldn’t move 2 of 12 tasks". */
  message: string;
  /** Why: "They were changed by Ivan Petrov". */
  detail?: string;
  /** The main step. */
  retry?(): void;
  /** A second one, e.g. "Show" — select the failed tasks on the board. */
  secondary?: ToastAction;
}

/** A running operation's toast: it turns into the result in place. */
export interface ProgressToastHandle {
  /** Steps done; a new message if the text counts ("Moving 40 tasks… 24 of 40"). */
  update(done: number, message?: string): void;
  /** Done: an undo toast in the same place, or nothing to say (no options). Returns the op id. */
  succeed(options?: UndoToastOptions): string | undefined;
  fail(options: ErrorToastOptions): void;
  dismiss(): void;
}

/**
 * Someone called you (spec: Toast · 07). The kit draws it and keeps the lane's
 * rules; what it is about is the app's: the kit knows no users and no inbox.
 */
export interface ToastNotification {
  /** The inbox notification's id: the same one sent twice shows once. */
  id: string;
  /** Anything the app's policy needs to decide ('mentioned', 'assigned'…). */
  kind?: string;
  /** The last actor, as the app draws them (a 20 px Avatar). */
  avatar?: React.ReactNode;
  /** Line 1, as in the inbox: "<b>Mira Sato</b> mentioned you". */
  title: React.ReactNode;
  /** Line 2: the task key and a quote or a name. */
  context?: React.ReactNode;
  /** The one phrase a screen reader hears: "Mira Sato mentioned you in TM-248: …". */
  announcement: string;
  /** What it is about: `toast.withdraw(subjectId)` takes it away when that is gone. */
  subjectId?: string;
  /** Open, and a click on the toast: open the subject without leaving the page. */
  onOpen(): void;
}

/**
 * The app's side of the rules: which notifications may interrupt at all —
 * their kinds, not while the inbox or that very task is open, quiet hours,
 * bots. The lane's own rules (a visible tab, one in 30 s, "+N more") are the
 * kit's.
 */
export type NotifyPolicy = (notification: ToastNotification) => boolean;

export type ActionToast =
  | { kind: 'undo'; key: number; message: string; detail?: string; op: string }
  | { kind: 'progress'; key: number; message: string; done: number; total?: number; onCancel?(): void }
  | {
      kind: 'error';
      key: number;
      message: string;
      detail?: string;
      retry?(): void;
      secondary?: ToastAction;
    }
  | { kind: 'note'; key: number; message: string };

export interface NoticeToast {
  key: number;
  notification: ToastNotification;
  /** Suitable ones that came while it was shown: "+2 more in Inbox". */
  more: number;
}
