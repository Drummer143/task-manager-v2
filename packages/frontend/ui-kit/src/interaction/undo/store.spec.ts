import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_HISTORY_LIMIT, undoHistory, useUndoStore } from './store';

beforeEach(() => undoHistory.clear());

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

  it('a failed undo rejects and keeps the operation, to be tried again', async () => {
    undoHistory.push({ label: 'offline', undo: () => Promise.reject(new Error('offline')) });

    await expect(undoHistory.undo()).rejects.toThrow('offline');
    expect(ids()).toEqual(['offline']);
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
});
