import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raw } from '../tokens';
import { useDelayedFlag, type DelayedFlagOptions } from './useDelayedFlag';

const OPTIONS: DelayedFlagOptions = { delay: 200, minVisible: 400 };

const setup = (options: DelayedFlagOptions = OPTIONS) =>
  renderHook(({ active }) => useDelayedFlag(active, options), {
    initialProps: { active: false },
  });

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDelayedFlag', () => {
  it('starts hidden', () => {
    const { result } = setup();

    expect(result.current).toBe(false);
  });

  it('never shows for activity shorter than the delay', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(120);
    rerender({ active: false });
    advance(1000);

    expect(result.current).toBe(false);
  });

  it('shows only once the delay has passed', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(199);
    expect(result.current).toBe(false);

    advance(1);
    expect(result.current).toBe(true);
  });

  it('holds the flag for the minimum even if activity ends right after showing', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(250); // shown at 200
    rerender({ active: false }); // 50 ms on screen

    advance(349);
    expect(result.current).toBe(true);

    advance(1); // 400 ms on screen
    expect(result.current).toBe(false);
  });

  it('hides immediately when the minimum has already passed', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(1500);
    rerender({ active: false });
    advance(0);

    expect(result.current).toBe(false);
  });

  it('keeps showing when activity restarts during the hold, without a new delay', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(250);
    rerender({ active: false });
    advance(100); // holding
    rerender({ active: true });

    advance(1000); // well past the old hide time
    expect(result.current).toBe(true);

    rerender({ active: false });
    advance(0); // on screen long enough already
    expect(result.current).toBe(false);
  });

  it('does not fire after unmount during the delay', () => {
    const { result, rerender, unmount } = setup();

    rerender({ active: true });
    advance(100);
    unmount();

    expect(() => advance(1000)).not.toThrow();
    expect(result.current).toBe(false);
  });

  it('shows again after a full cycle, with the delay applied anew', () => {
    const { result, rerender } = setup();

    rerender({ active: true });
    advance(1500);
    rerender({ active: false });
    advance(0);

    rerender({ active: true });
    advance(199);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
  });

  it('defaults to the spinner tokens', () => {
    // No options object at all — the hook must fall back to the tokens.
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    advance(raw['spinner-delay'] - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);

    rerender({ active: false });
    advance(raw['spinner-min'] - 1);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);
  });
});
