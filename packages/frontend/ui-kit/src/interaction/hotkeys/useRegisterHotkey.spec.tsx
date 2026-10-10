import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRegisterHotkey } from './useRegisterHotkey';
import { useHotkeysStore } from './store';
import type { HotkeyHandlerConfig } from './types';

beforeEach(() => {
  useHotkeysStore.setState({ hotkeys: {} });
});

const press = (key: string) => useHotkeysStore.getState().getHotkeyHandler(key)?.(new KeyboardEvent('keydown', { key }));

it('registers on mount and unregisters on unmount', () => {
  const config = { key: 'c', description: 'create', callback: vi.fn() };

  const { unmount } = renderHook(() => useRegisterHotkey(config));
  press('c');
  expect(config.callback).toHaveBeenCalledTimes(1);

  unmount();
  expect(useHotkeysStore.getState().getHotkeyHandler('c')).toBeUndefined();
});

it('calls the latest callback without registering again', () => {
  const first = vi.fn();
  const second = vi.fn();
  const register = vi.spyOn(useHotkeysStore.getState(), 'registerHotkey');

  const { rerender } = renderHook((callback: HotkeyHandlerConfig['callback']) =>
    useRegisterHotkey({ key: 'c', description: 'create', callback }), { initialProps: first });
  rerender(second);
  press('c');

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledTimes(1);
});

it('keeps its place above an earlier registration of the same key', () => {
  const below = vi.fn();
  const above = vi.fn();

  // The earlier one renders again with a new config object: it must not jump to the top
  const { rerender } = renderHook(() => useRegisterHotkey({ key: 'c', description: 'below', callback: below }));
  renderHook(() => useRegisterHotkey({ key: 'c', description: 'above', callback: above }));
  rerender();
  press('c');

  expect(above).toHaveBeenCalledTimes(1);
  expect(below).not.toHaveBeenCalled();
});

it('registers again when the combination changes', () => {
  const callback = vi.fn();

  const { rerender } = renderHook((key: string) => useRegisterHotkey({ key, description: 'x', callback }), {
    initialProps: 'a',
  });
  rerender('b');

  expect(useHotkeysStore.getState().getHotkeyHandler('a')).toBeUndefined();
  press('b');
  expect(callback).toHaveBeenCalledTimes(1);
});
