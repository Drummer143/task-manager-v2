import { beforeEach, expect, it } from 'vitest';
import { useCursorStore } from './store';

beforeEach(() => {
  useCursorStore.setState({ cursor: null });
});

it('sets and clears the cursor', () => {
  useCursorStore.getState().setCursor('TM-1');
  expect(useCursorStore.getState().cursor).toBe('TM-1');

  useCursorStore.getState().clearCursor();
  expect(useCursorStore.getState().cursor).toBeNull();
});
