import { beforeEach, describe, expect, it } from 'vitest';
import { useEscapeStore } from './store';

beforeEach(() => {
  useEscapeStore.setState({ stack: [] });
});

describe('escape ladder', () => {
  it('runs the topmost level and steps down as levels are removed (LIFO)', () => {
    const calls: string[] = [];
    useEscapeStore.getState().push(() => {
      calls.push('low');
      return true;
    });
    const popTop = useEscapeStore.getState().push(() => {
      calls.push('top');
      return true;
    });

    expect(useEscapeStore.getState().handleEscape()).toBe(true);
    expect(calls).toEqual(['top']);

    popTop();
    useEscapeStore.getState().handleEscape();
    expect(calls).toEqual(['top', 'low']);
  });

  it('falls through to the next level when one passes (returns false)', () => {
    const calls: string[] = [];
    useEscapeStore.getState().push(() => {
      calls.push('low');
      return true;
    });
    useEscapeStore.getState().push(() => {
      calls.push('top');
      return false;
    });

    useEscapeStore.getState().handleEscape();
    expect(calls).toEqual(['top', 'low']);
  });

  it('reports when nothing consumed the escape', () => {
    useEscapeStore.getState().push(() => false);
    expect(useEscapeStore.getState().handleEscape()).toBe(false);
  });
});
