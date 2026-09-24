import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRegisterHotkey } from './useRegisterHotkey';
import { useHotkeysStore } from './store';

beforeEach(() => {
  useHotkeysStore.setState({ hotkeys: {} });
});

it('registers on mount and unregisters on unmount', () => {
  const config = { key: 'c', description: 'create', callback: vi.fn() };

  const { unmount } = renderHook(() => useRegisterHotkey(config));
  expect(useHotkeysStore.getState().getHotkeyHandler('c')).toBe(config.callback);

  unmount();
  expect(useHotkeysStore.getState().getHotkeyHandler('c')).toBeUndefined();
});
