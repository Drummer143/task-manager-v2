import { afterEach, describe, expect, it } from 'vitest';
import { useCursorStore } from '@task-manager-v2/ui-kit';
import { neighbourOf, stepCursorOff } from './cursor';

const rows = ['a', 'b', 'c'].map((id) => ({ id }));
const cursor = () => useCursorStore.getState().cursor;

afterEach(() => {
  useCursorStore.getState().clearCursor();
});

describe('neighbourOf', () => {
  it.each([
    ['the next row', 'a', 'b'],
    ['the next row, in the middle', 'b', 'c'],
    ['the previous row, at the end', 'c', 'b'],
  ])('%s', (_, id, expected) => {
    expect(neighbourOf(rows, id)?.id).toBe(expected);
  });

  it('nothing when it was the only row, or is not in the list', () => {
    expect(neighbourOf([{ id: 'a' }], 'a')).toBeUndefined();
    expect(neighbourOf(rows, 'z')).toBeUndefined();
  });
});

describe('stepCursorOff', () => {
  it('moves the highlight off the row that leaves', () => {
    useCursorStore.getState().setCursor('b');

    stepCursorOff(rows, 'b');

    expect(cursor()).toBe('c');
  });

  it('leaves the highlight alone when another row leaves', () => {
    useCursorStore.getState().setCursor('b');

    stepCursorOff(rows, 'a');

    expect(cursor()).toBe('b');
  });

  it('clears it when the last row leaves', () => {
    useCursorStore.getState().setCursor('a');

    stepCursorOff([{ id: 'a' }], 'a');

    expect(cursor()).toBeNull();
  });
});
