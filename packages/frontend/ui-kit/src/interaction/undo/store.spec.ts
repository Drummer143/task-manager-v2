import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_GLOBAL_SCOPE, UNDO_HISTORY_LIMIT, undoHistory, useUndoStore } from './store';

beforeEach(() => {
  undoHistory.clear();
  undoHistory.setScope(null);
});

const ids = () => useUndoStore.getState().past.map((entry) => entry.label);

describe('undoHistory', () => {
  it('undoes the last operation first', async () => {
    const first = vi.fn();
    const second = vi.fn();

    undoHistory.push({ label: 'first', undo: first });
    undoHistory.push({ label: 'second', undo: second });

    await undoHistory.undo();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(ids()).toEqual(['first']);
  });

  it('undoes a given operation by id — the toast’s own', async () => {
    const first = vi.fn();
    const id = undoHistory.push({ label: 'first', undo: first });

    undoHistory.push({ label: 'second', undo: vi.fn() });

    await undoHistory.undo(id);
    expect(first).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['second']);
  });

  it('redoes what was undone, only when the operation can be redone', async () => {
    const redo = vi.fn();

    undoHistory.push({ label: 'redoable', undo: vi.fn(), redo });
    await undoHistory.undo();
    await undoHistory.redo();

    expect(redo).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['redoable']);

    undoHistory.push({ label: 'one-way', undo: vi.fn() });
    await undoHistory.undo();
    expect(await undoHistory.redo()).toBeNull();
  });

  it('a new operation clears what could be redone', async () => {
    undoHistory.push({ label: 'a', undo: vi.fn(), redo: vi.fn() });
    await undoHistory.undo();
    undoHistory.push({ label: 'b', undo: vi.fn() });

    expect(useUndoStore.getState().future).toEqual([]);
  });

  it('a failed undo rejects and leaves the history: it never blocks the operations before it', async () => {
    const earlier = vi.fn();

    undoHistory.push({ label: 'earlier', undo: earlier });
    undoHistory.push({ label: 'offline', undo: () => Promise.reject(new Error('offline')) });

    await expect(undoHistory.undo()).rejects.toThrow('offline');
    expect(ids()).toEqual(['earlier']);

    await undoHistory.undo();
    expect(earlier).toHaveBeenCalledTimes(1);
  });

  it('retry tries a failed step again; done, the entry goes where the step leads', async () => {
    const undo = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const redo = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);

    undoHistory.push({ label: 'flaky', undo, redo });

    const entry = useUndoStore.getState().past[0];

    await expect(undoHistory.undo()).rejects.toThrow();
    await undoHistory.retry(entry, 'undo');
    expect(useUndoStore.getState().future).toEqual([entry]);

    await expect(undoHistory.redo()).rejects.toThrow();
    expect(useUndoStore.getState().future).toEqual([]);
    await undoHistory.retry(entry, 'redo');
    expect(ids()).toEqual(['flaky']);
  });

  it('takes the entry out before it runs: two quick mod+Z undo two operations', async () => {
    const first = vi.fn();
    const second = vi.fn();

    undoHistory.push({ label: 'first', undo: first });
    undoHistory.push({ label: 'second', undo: () => new Promise<void>((resolve) => setTimeout(resolve)) });

    const slow = undoHistory.undo();

    await undoHistory.undo();
    await slow;

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('forgets the oldest past the limit', () => {
    for (let index = 0; index <= UNDO_HISTORY_LIMIT; index++) {
      undoHistory.push({ label: String(index), undo: vi.fn() });
    }

    expect(ids()).toHaveLength(UNDO_HISTORY_LIMIT);
    expect(ids()[0]).toBe('1');
  });

  it('removes an operation that can no longer be undone', async () => {
    const undo = vi.fn();
    const id = undoHistory.push({ label: 'gone', undo });

    undoHistory.remove(id);

    expect(await undoHistory.undo()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  describe('scopes', () => {
    it('mod+Z reaches only this page’s operations and the global ones; the rest wait', async () => {
      const onBoardA = vi.fn();
      const inTree = vi.fn();

      undoHistory.setScope('board-a');
      undoHistory.push({ label: 'move on A', undo: onBoardA });
      undoHistory.push({ label: 'rename page', undo: inTree, scope: UNDO_GLOBAL_SCOPE });

      undoHistory.setScope('board-b');
      await undoHistory.undo();
      expect(inTree).toHaveBeenCalledTimes(1);

      // Nothing of B's own, and A's operation is out of reach from here.
      expect(await undoHistory.undo()).toBeNull();
      expect(onBoardA).not.toHaveBeenCalled();

      undoHistory.setScope('board-a');
      await undoHistory.undo();
      expect(onBoardA).toHaveBeenCalledTimes(1);
    });

    it('the toast undoes its own operation from any page', async () => {
      const undo = vi.fn();

      undoHistory.setScope('board-a');
      const id = undoHistory.push({ label: 'move on A', undo });

      undoHistory.setScope('board-b');
      await undoHistory.undo(id);
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it('redo is scoped too, and a new operation clears only its own scope’s redo', async () => {
      undoHistory.setScope('board-a');
      undoHistory.push({ label: 'on A', undo: vi.fn(), redo: vi.fn() });
      await undoHistory.undo();

      undoHistory.setScope('board-b');
      expect(undoHistory.next('redo')).toBeUndefined();
      undoHistory.push({ label: 'on B', undo: vi.fn() });

      undoHistory.setScope('board-a');
      expect(undoHistory.next('redo')?.label).toBe('on A');
    });

    it('without a scope set, everything is in reach', async () => {
      undoHistory.push({ label: 'anywhere', undo: vi.fn(), scope: 'board-a' });

      expect(undoHistory.next('undo')?.label).toBe('anywhere');
    });
  });
});
