import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from './ToastHost';
import { toast, useToastStore } from './store';
import type { ToastNotification } from './types';
import { undoHistory, useUndoStore } from '../../interaction/undo';
import { raw } from '../../tokens';

const INITIAL = useToastStore.getState();

const notification = (id: string, extra: Partial<ToastNotification> = {}): ToastNotification => ({
  id,
  title: 'Mira Sato mentioned you',
  context: 'TM-248 “Can we reuse the undo toast here?”',
  announcement: 'Mira Sato mentioned you in TM-248',
  subjectId: 'TM-248',
  onOpen: vi.fn(),
  ...extra,
});

const pressUndo = (init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...init }));
  });

/** The lanes, not the live regions: those repeat every message for screen readers. */
const inLanes = () => within(document.querySelector<HTMLElement>('[data-toast]')?.parentElement ?? document.createElement('div'));

const flush = () => act(async () => undefined);

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const toastEl = (kind: 'action' | 'notice') => document.querySelector<HTMLElement>(`[data-toast="${kind}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  useToastStore.setState(INITIAL, true);
  undoHistory.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  describe('undo', () => {
    it('undoes its operation and goes; the history no longer has it', async () => {
      const undo = vi.fn();

      render(<ToastHost />);
      act(() => void toast.undo({ message: '3 tasks moved to Done', undo }));

      expect(inLanes().getByText('3 tasks moved to Done')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
      await flush();

      expect(undo).toHaveBeenCalledTimes(1);
      expect(toastEl('action')).toBeNull();
      expect(useUndoStore.getState().past).toEqual([]);
    });

    it('lives --undo-window; mod+Z still undoes after it is gone', async () => {
      const undo = vi.fn();

      render(<ToastHost />);
      act(() => void toast.undo({ message: '3 tasks moved to Done', undo }));

      advance(raw['undo-window']);
      expect(toastEl('action')).toBeNull();

      pressUndo();
      await flush();
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it('mod+Z undoes the one on screen, and the toast goes with it; mod+Shift+Z redoes', async () => {
      const redo = vi.fn();

      render(<ToastHost />);
      act(() => void toast.undo({ message: 'Moved', undo: vi.fn(), redo }));

      pressUndo();
      await flush();
      expect(toastEl('action')).toBeNull();

      pressUndo({ shiftKey: true });
      await flush();
      expect(redo).toHaveBeenCalledTimes(1);
    });

    it('a field keeps its own mod+Z', async () => {
      const undo = vi.fn();

      render(
        <>
          <input aria-label="Title" />
          <ToastHost />
        </>,
      );
      act(() => void toast.undo({ message: 'Moved', undo }));

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'z', ctrlKey: true });
      await flush();
      expect(undo).not.toHaveBeenCalled();
    });

    it('the timer stands while the pointer is on it', () => {
      render(<ToastHost />);
      act(() => void toast.undo({ message: 'Moved', undo: vi.fn() }));

      advance(raw['undo-window'] / 2);
      fireEvent.mouseEnter(toastEl('action') as HTMLElement);
      advance(raw['undo-window']);
      expect(toastEl('action')).not.toBeNull();

      fireEvent.mouseLeave(toastEl('action') as HTMLElement);
      advance(raw['undo-window'] / 2 - 1);
      expect(toastEl('action')).not.toBeNull();
      advance(1);
      expect(toastEl('action')).toBeNull();
    });

    it('a failed undo says so, and Retry tries again', async () => {
      const undo = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);

      render(<ToastHost />);
      act(() => void toast.undo({ message: 'Status set to Blocked', undo }));

      pressUndo();
      await flush();
      expect(inLanes().getByText('Couldn’t undo “Status set to Blocked”')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await flush();
      expect(undo).toHaveBeenCalledTimes(2);
    });
  });

  describe('one at a time', () => {
    it('a new toast replaces the current one', () => {
      render(<ToastHost />);
      act(() => void toast.undo({ message: 'Moved', undo: vi.fn() }));
      act(() => toast.note('Link copied'));

      expect(inLanes().queryByText('Moved')).toBeNull();
      expect(inLanes().getByText('Link copied')).toBeTruthy();
    });

    it('an error is never pushed out: the new one waits for its decision', () => {
      render(<ToastHost />);
      act(() => void toast.error({ message: 'Couldn’t move 2 of 12 tasks' }));
      act(() => toast.note('Link copied'));

      expect(inLanes().getByText('Couldn’t move 2 of 12 tasks')).toBeTruthy();
      advance(raw['undo-window'] * 10);
      expect(inLanes().getByText('Couldn’t move 2 of 12 tasks')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(inLanes().getByText('Link copied')).toBeTruthy();
    });

    it('a note lives --toast-note', () => {
      render(<ToastHost />);
      act(() => toast.note('Link copied'));

      advance(raw['toast-note']);
      expect(toastEl('action')).toBeNull();
    });
  });

  describe('progress', () => {
    it('counts, then becomes the undo in place', () => {
      render(<ToastHost />);

      let run: ReturnType<typeof toast.progress> | undefined;

      act(() => {
        run = toast.progress({ message: 'Moving 40 tasks…', total: 40 });
      });
      const element = toastEl('action');

      act(() => run?.update(24, 'Moving 40 tasks… 24 of 40'));
      expect(inLanes().getByText('Moving 40 tasks… 24 of 40')).toBeTruthy();
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60');

      act(() => void run?.succeed({ message: '40 tasks moved to Review', undo: vi.fn() }));
      expect(inLanes().getByText('40 tasks moved to Review')).toBeTruthy();
      expect(toastEl('action')).toBe(element);
      expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();
    });

    it('fails into an error with Retry; Cancel stops it', () => {
      const retry = vi.fn();
      const onCancel = vi.fn();

      render(<ToastHost />);

      let run: ReturnType<typeof toast.progress> | undefined;

      act(() => {
        run = toast.progress({ message: 'Moving 40 tasks…', onCancel });
      });
      act(() => run?.fail({ message: 'Couldn’t move 2 of 40 tasks', retry }));

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(toastEl('action')).toBeNull();

      act(() => {
        run = toast.progress({ message: 'Moving 40 tasks…', onCancel });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(toastEl('action')).toBeNull();
    });
  });

  describe('notify', () => {
    it('has its own lane: an action toast does not push it out', () => {
      render(<ToastHost />);
      act(() => toast.notify(notification('n1')));
      act(() => void toast.undo({ message: 'Moved', undo: vi.fn() }));

      expect(toastEl('notice')).not.toBeNull();
      expect(toastEl('action')).not.toBeNull();
    });

    it('while it is on screen, new ones add "+N more"; the timer is not prolonged', () => {
      render(<ToastHost />);
      act(() => toast.notify(notification('n1')));
      advance(raw['notify-duration'] - 1);
      act(() => toast.notify(notification('n2')));
      act(() => toast.notify(notification('n3')));

      expect(inLanes().getByText('+2 more in Inbox')).toBeTruthy();
      advance(1);
      expect(toastEl('notice')).toBeNull();
    });

    it('at most one in --notify-gap', () => {
      render(<ToastHost />);
      act(() => toast.notify(notification('n1')));
      advance(raw['notify-duration']);
      act(() => toast.notify(notification('n2')));
      expect(toastEl('notice')).toBeNull();

      advance(raw['notify-gap']);
      act(() => toast.notify(notification('n3')));
      expect(toastEl('notice')).not.toBeNull();
    });

    it('the app’s policy decides what may interrupt at all', () => {
      render(<ToastHost notifyPolicy={(n) => n.kind === 'mentioned'} />);
      act(() => toast.notify(notification('n1', { kind: 'commented' })));
      expect(toastEl('notice')).toBeNull();

      act(() => toast.notify(notification('n2', { kind: 'mentioned' })));
      expect(toastEl('notice')).not.toBeNull();
    });

    it('a click opens it; its subject gone, it goes at once', () => {
      const onOpen = vi.fn();

      render(<ToastHost />);
      act(() => toast.notify(notification('n1', { onOpen })));
      fireEvent.click(toastEl('notice') as HTMLElement);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(toastEl('notice')).toBeNull();

      advance(raw['notify-gap']);
      act(() => toast.notify(notification('n2')));
      act(() => toast.withdraw('TM-248'));
      expect(toastEl('notice')).toBeNull();
    });
  });

  describe('keyboard and readers', () => {
    it('never takes focus; F8 goes to the notification, then the action toast, then back; Esc closes', () => {
      render(
        <>
          <button type="button">Board</button>
          <ToastHost />
        </>,
      );
      const board = screen.getByRole('button', { name: 'Board' });

      board.focus();
      act(() => toast.notify(notification('n1')));
      act(() => void toast.undo({ message: 'Moved', undo: vi.fn() }));
      expect(document.activeElement).toBe(board);

      const f8 = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true })));

      f8();
      expect(document.activeElement).toBe(toastEl('notice'));
      f8();
      expect(document.activeElement).toBe(toastEl('action'));
      f8();
      expect(document.activeElement).toBe(board);

      f8();
      fireEvent.keyDown(toastEl('notice') as HTMLElement, { key: 'Escape' });
      expect(toastEl('notice')).toBeNull();
      expect(document.activeElement).toBe(board);
    });

    it('speaks politely, errors assertively', () => {
      render(<ToastHost />);
      act(() => void toast.undo({ message: 'Moved', detail: 'With 12 tasks', undo: vi.fn() }));
      expect(screen.getByRole('status').textContent).toBe('Moved. With 12 tasks');

      act(() => void toast.error({ message: 'Couldn’t move 2 of 12 tasks' }));
      expect(screen.getByRole('alert').textContent).toBe('Couldn’t move 2 of 12 tasks');
    });
  });
});

