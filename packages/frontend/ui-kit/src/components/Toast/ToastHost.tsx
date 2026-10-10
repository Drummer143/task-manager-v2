import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { raw } from '../../tokens';
import { composeRefs } from '../../utils';
import { AlertIcon, XIcon } from '../../icons';
import { useDocumentHidden } from '../../hooks';
import { useSingleInstance } from '../../hooks/useSingleInstance';
import { useMessages, type KitMessages } from '../../messages';
import { isTypingTarget } from '../../interaction/hotkeys';
import { undoHistory, useUndoStore, type UndoEntry } from '../../interaction/undo';
import { usePresence } from '../../overlay';
import { Button, IconButton } from '../Button';
import { matchKeys } from '../Kbd';
import { Progress } from '../Progress';
import { Spinner } from '../Spinner';
import { Surface, oppositeSurface, useSurface, type SurfaceTone } from '../Surface';
import { toast, toastControls, useToastStore } from './store';
import type { ActionToast, NoticeToast, NotifyPolicy } from './types';
import { useLifetime } from './useLifetime';
import styles from './Toast.module.scss';

const TOAST_ATTR = 'data-toast';

/** F8 brought focus into the toasts: Esc, or F8 past the last one, takes it back there. */
let returnFocusTo: HTMLElement | null = null;

const giveFocusBack = () => {
  const target = returnFocusTo;

  returnFocusTo = null;
  target?.focus?.({ preventScroll: true });
};

/** Closing a toast that has focus: focus goes back where F8 took it from, never to <body> by surprise. */
const closeFrom = (element: HTMLElement | null, close: () => void) => {
  const hadFocus = element?.contains(document.activeElement) ?? false;

  close();

  if (hadFocus) {
    giveFocusBack();
  }
};

/** The timer stands while the pointer or focus is on the toast, and while the tab is hidden (spec: Toast · 03). */
const usePause = () => {
  const hidden = useDocumentHidden();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    paused: hidden || hovered || focused,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      },
    },
  };
};

/**
 * Undo, or redo, with the failure said out loud. A failed operation leaves the
 * history at once — the next mod+Z goes on to the one before it; Retry in the
 * error toast tries that same operation again, for as long as the toast is there.
 */
const useRunUndo = (messages: KitMessages) => {
  const failed = (entry: UndoEntry, step: 'undo' | 'redo') => () =>
    toast.error({
      message: messages.undoFailed(entry.label),
      retry: () => {
        undoHistory.retry(entry, step).catch(failed(entry, step));
      },
    });

  return (redo: boolean, id?: string) => {
    const step = redo ? 'redo' : 'undo';
    // The toast's own operation wherever it was done; mod+Z — the next one in reach here.
    const entry = id ? useUndoStore.getState().past.find((item) => item.id === id) : undoHistory.next(step);

    if (!entry) {
      return;
    }

    (redo ? undoHistory.redo() : undoHistory.undo(entry.id)).catch(failed(entry, step));
  };
};

const lifetimeOf = (item: ActionToast) =>
  item.kind === 'undo' ? raw['undo-window'] : item.kind === 'note' ? raw['toast-note'] : null;

const ActionToastView: React.FC<{
  item: ActionToast;
  leaving: boolean;
  tone: SurfaceTone;
  onUndo(op: string): void;
  ref: React.Ref<HTMLDivElement>;
}> = ({ item, leaving, tone, onUndo, ref }) => {
  const messages = useMessages();
  const self = useRef<HTMLDivElement | null>(null);
  const { paused, handlers } = usePause();
  const close = () => closeFrom(self.current, () => toastControls.close(item.key));

  useLifetime(leaving ? null : lifetimeOf(item), paused, () => toastControls.close(item.key));

  const dismissible = item.kind === 'undo' || item.kind === 'error';

  return (
    <Surface tone={tone} asChild>
      <div
        ref={composeRefs(self, ref)}
        className={styles.toast}
        tabIndex={-1}
        data-kind={item.kind}
        data-paused={paused || undefined}
        data-leaving={leaving || undefined}
        {...{ [TOAST_ATTR]: 'action' }}
        {...handlers}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // One press, one step: the Esc ladder does not see it.
            event.preventDefault();

            if (item.kind === 'progress') {
              giveFocusBack();
            } else {
              close();
            }
          }
        }}
      >
        {item.kind === 'progress' && (
          <span className={styles.icon}>
            <Spinner size="xs" variant="neutral" />
          </span>
        )}
        {item.kind === 'error' && (
          <span className={styles.icon} data-error="">
            <AlertIcon />
          </span>
        )}

        <span className={styles.message}>
          {item.message}
          {'detail' in item && item.detail && <span className={styles.detail}>{item.detail}</span>}
        </span>

        {item.kind === 'undo' && (
          <Button
            size="sm"
            variant="primary"
            keys="mod+z"
            onClick={() => {
              closeFrom(self.current, () => undefined);
              onUndo(item.op);
            }}
          >
            {messages.toastUndo}
          </Button>
        )}
        {item.kind === 'error' && item.retry && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              close();
              item.retry?.();
            }}
          >
            {messages.retry}
          </Button>
        )}
        {item.kind === 'error' && item.secondary && (
          <Button size="sm" variant="ghost" onClick={() => item.secondary?.onAction()}>
            {item.secondary.label}
          </Button>
        )}
        {item.kind === 'progress' && item.onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              close();
              item.onCancel?.();
            }}
          >
            {messages.toastCancel}
          </Button>
        )}
        {dismissible && <IconButton size="sm" icon={<XIcon />} label={messages.toastDismiss} onClick={close} />}

        {item.kind === 'undo' && <span className={styles.timer} aria-hidden="true" />}
        {item.kind === 'progress' && (
          <Progress
            className={styles.progress}
            value={item.total ? item.done / item.total : undefined}
            label={item.message}
            delay={0}
          />
        )}
      </div>
    </Surface>
  );
};

const NoticeToastView: React.FC<{
  item: NoticeToast;
  leaving: boolean;
  tone: SurfaceTone;
  ref: React.Ref<HTMLDivElement>;
}> = ({ item, leaving, tone, ref }) => {
  const messages = useMessages();
  const self = useRef<HTMLDivElement | null>(null);
  const { paused, handlers } = usePause();
  const { notification, more } = item;
  const close = () => closeFrom(self.current, toastControls.closeNotice);
  const open = () => {
    close();
    notification.onOpen();
  };

  // "+N more" does not prolong it (spec: Toast · 07).
  useLifetime(leaving ? null : raw['notify-duration'], paused, toastControls.closeNotice);

  return (
    <Surface tone={tone} asChild>
      <div
        ref={composeRefs(self, ref)}
        className={styles.toast}
        tabIndex={-1}
        data-kind="notify"
        data-paused={paused || undefined}
        data-leaving={leaving || undefined}
        {...{ [TOAST_ATTR]: 'notice' }}
        {...handlers}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          } else if (event.key === 'Enter' && event.target === event.currentTarget) {
            event.preventDefault();
            open();
          }
        }}
      >
        {notification.avatar !== undefined && <span className={styles.avatar}>{notification.avatar}</span>}

        <span className={styles.message}>
          <span className={styles.title}>{notification.title}</span>
          {notification.context !== undefined && <span className={styles.context}>{notification.context}</span>}
          {more > 0 && <span className={styles.more}>{messages.notifyMore(more)}</span>}
        </span>

        <span className={styles.actions}>
          <Button
            size="sm"
            variant="primary"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
          >
            {messages.toastOpen}
          </Button>
          <IconButton
            size="sm"
            icon={<XIcon />}
            label={messages.toastDismiss}
            onClick={(event) => {
              event.stopPropagation();
              close();
            }}
          />
        </span>

        <span className={styles.timer} aria-hidden="true" />
      </div>
    </Surface>
  );
};

/** A lane keeps its last toast while it fades out; a replacement comes in without the old one's exit. */
const useLane = <T extends { key: number }>(current: T | null, instant = false) => {
  const ref = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState(current);

  if (current && current !== last) {
    setLast(current);
  }

  const mounted = usePresence(current !== null, ref);
  const item = current ?? (mounted && !instant ? last : null);

  return { ref, item, leaving: current === null };
};

const ActionLane: React.FC<{ tone: SurfaceTone; onUndo(op: string): void }> = ({ tone, onUndo }) => {
  const current = useToastStore((state) => state.action);
  const past = useUndoStore((state) => state.past);
  const { ref, item, leaving } = useLane(current);

  // Undone by mod+Z, or anywhere else: the toast for it has nothing left to offer.
  useEffect(() => {
    if (current?.kind === 'undo' && !past.some((entry) => entry.id === current.op)) {
      toastControls.close(current.key);
    }
  }, [current, past]);

  return item ? <ActionToastView ref={ref} key={item.key} item={item} leaving={leaving} tone={tone} onUndo={onUndo} /> : null;
};

const NoticeLane: React.FC<{ tone: SurfaceTone }> = ({ tone }) => {
  const current = useToastStore((state) => state.notice);
  const withdrawn = useToastStore((state) => state.noticeWithdrawn);
  const { ref, item, leaving } = useLane(current, withdrawn);

  return item ? <NoticeToastView ref={ref} key={item.key} item={item} leaving={leaving} tone={tone} /> : null;
};

/**
 * What screen readers hear (spec: Toast · 04): polite for undo, note,
 * progress and notifications, assertive for errors. The regions are always
 * there — text added to a region that just appeared is often not read. A
 * progress is heard when it starts and when it ends, not at every step.
 */
const Announcer: React.FC = () => {
  const action = useToastStore((state) => state.action);
  const notice = useToastStore((state) => state.notice);
  const [polite, setPolite] = useState({ key: 0, text: '' });
  const [assertive, setAssertive] = useState({ key: 0, text: '' });
  const actionStage = action ? `${action.key}:${action.kind}` : '';
  const noticeKey = notice?.key;
  // What was announced already: a re-render showing the same toast stage or the same
  // notification must not announce it again. Adjusted during render, not in an effect
  const [heardStage, setHeardStage] = useState('');
  const [heardNotice, setHeardNotice] = useState<number | undefined>(undefined);

  if (heardStage !== actionStage) {
    setHeardStage(actionStage);

    if (action) {
      const text = [action.message, 'detail' in action ? action.detail : undefined].filter(Boolean).join('. ');
      const say = action.kind === 'error' ? setAssertive : setPolite;

      say((current) => ({ key: current.key + 1, text }));
    }
  }

  if (heardNotice !== noticeKey) {
    setHeardNotice(noticeKey);

    if (notice) {
      setPolite((current) => ({ key: current.key + 1, text: notice.notification.announcement }));
    }
  }

  return (
    <div className={styles.srOnly}>
      <div role="status" aria-live="polite">
        <span key={polite.key}>{polite.text}</span>
      </div>
      <div role="alert" aria-live="assertive">
        <span key={assertive.key}>{assertive.text}</span>
      </div>
    </div>
  );
};

export interface ToastHostProps {
  notifyPolicy?: NotifyPolicy;
}

const allowAll: NotifyPolicy = () => true;

/** The surface a DOM place sits on, read from the nearest `data-surface`. */
const surfaceOf = (element: HTMLElement | null): SurfaceTone | undefined => {
  const value = element?.closest('[data-surface]')?.getAttribute('data-surface');

  return value === 'inverse' || value === 'default' ? value : undefined;
};

/**
 * Where toasts appear (spec: Toast), mounted once by KitRoot: at the bottom
 * centre of the canvas (AppShell registers it) or of the window. A
 * notification has its own lane above the action toast; neither pushes the
 * other out. Toasts take the surface opposite to the canvas, never take
 * focus; F8 goes to them and back. mod+Z / mod+Shift+Z drive the undo history.
 */
export const ToastHost: React.FC<ToastHostProps> = ({ notifyPolicy = allowAll }) => {
  const primary = useSingleInstance('ToastHost');
  const messages = useMessages();
  const area = useToastStore((state) => state.area);
  // The surface opposite to the canvas, like a tooltip's: the area's own, when there is one.
  const hostSurface = useSurface();
  const tone = oppositeSurface(surfaceOf(area) ?? hostSurface);
  const viewportRef = useRef<HTMLDivElement>(null);
  const runUndo = useRunUndo(messages);
  const undoFromKeys = useEffectEvent((redo: boolean) => runUndo(redo));

  useEffect(() => {
    if (primary) {
      useToastStore.setState({ policy: notifyPolicy });
    }
  }, [primary, notifyPolicy]);

  useEffect(() => {
    if (!primary) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      // F8: to the notification, then to the action toast, then back (spec: Toast · 04, 07).
      if (event.key === 'F8' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const toasts = [
          ...(viewportRef.current?.querySelectorAll<HTMLElement>(`[${TOAST_ATTR}]:not([data-leaving])`) ?? []),
        ];

        if (toasts.length === 0) {
          return;
        }

        event.preventDefault();

        const index = toasts.findIndex((element) => element.contains(document.activeElement));

        if (index === -1) {
          returnFocusTo = document.activeElement as HTMLElement | null;
          toasts[0].focus();
        } else if (index < toasts.length - 1) {
          toasts[index + 1].focus();
        } else {
          giveFocusBack();
        }

        return;
      }

      // A field keeps its own undo.
      if (isTypingTarget(event.target)) {
        return;
      }

      const redo = matchKeys('mod+shift+z', event);

      if (redo || matchKeys('mod+z', event)) {
        event.preventDefault();
        undoFromKeys(redo);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [primary]);

  if (!primary) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div ref={viewportRef} className={styles.viewport} data-contained={area ? '' : undefined}>
          <NoticeLane tone={tone} />
          <ActionLane tone={tone} onUndo={(op) => runUndo(false, op)} />
        </div>,
        area ?? document.body,
      )}
      {createPortal(<Announcer />, document.body)}
    </>
  );
};

/** Registers where toasts stand — AppShell's canvas column. One at a time; the last one wins. */
export const useToastArea = (ref: React.RefObject<HTMLElement | null>) =>
  useEffect(() => {
    const element = ref.current;

    useToastStore.setState({ area: element });

    return () => {
      if (useToastStore.getState().area === element) {
        useToastStore.setState({ area: null });
      }
    };
  }, [ref]);
