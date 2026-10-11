import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useEscapeStack } from './useEscapeStack';
import { useEscapeStore } from './store';
import type { EscapeHandler } from './store';

beforeEach(() => {
  useEscapeStore.setState({ stack: [] });
});

const escape = () => useEscapeStore.getState().handleEscape();

it('calls the latest handler without pushing again', () => {
  const first = vi.fn();
  const second = vi.fn();

  const { rerender } = renderHook((handler: EscapeHandler) => useEscapeStack(handler), { initialProps: first });
  rerender(second);
  escape();

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(useEscapeStore.getState().stack).toHaveLength(1);
});

it('keeps its level below one opened after it', () => {
  const below = vi.fn();
  const above = vi.fn();

  // The earlier level renders again with a new handler: it must not jump to the top
  const { rerender } = renderHook(() => useEscapeStack(() => below()));
  renderHook(() => useEscapeStack(above));
  rerender();
  escape();

  expect(above).toHaveBeenCalledTimes(1);
  expect(below).not.toHaveBeenCalled();
});

it('leaves the ladder while disabled and on unmount', () => {
  const handler = vi.fn();

  const { rerender, unmount } = renderHook((enabled: boolean) => useEscapeStack(handler, enabled), {
    initialProps: true,
  });
  rerender(false);
  expect(escape()).toBe(false);

  rerender(true);
  expect(escape()).toBe(true);

  unmount();
  expect(useEscapeStore.getState().stack).toHaveLength(0);
});
