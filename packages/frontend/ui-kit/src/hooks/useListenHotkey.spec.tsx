import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useListenHotkey } from './useListenHotkey';
import { getHotkeyCombinationString, useHotkeysStore, type HotkeyConfig } from '../hotkeys';

const register = (config: HotkeyConfig) =>
  useHotkeysStore.getState().registerHotkey(getHotkeyCombinationString(config), config);

const keydown = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }));

beforeEach(() => {
  useHotkeysStore.setState({ hotkeys: {} });
});

it('fires a combo hotkey', () => {
  const callback = vi.fn();
  register({ key: 'k', meta: true, description: 'palette', callback });
  renderHook(() => useListenHotkey());

  keydown({ key: 'k', metaKey: true });
  expect(callback).toHaveBeenCalledOnce();
});

it('fires a chord (G then B) and waits after the prefix', () => {
  const callback = vi.fn();
  register({ key: 'b', chord: { key: 'g' }, description: 'go to board', callback });
  renderHook(() => useListenHotkey());

  keydown({ key: 'g' });
  expect(callback).not.toHaveBeenCalled();

  keydown({ key: 'b' });
  expect(callback).toHaveBeenCalledOnce();
});

it('ignores hotkeys while typing in an input', () => {
  const callback = vi.fn();
  register({ key: 'c', description: 'create', callback });
  renderHook(() => useListenHotkey());

  const input = document.createElement('input');
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  input.remove();

  expect(callback).not.toHaveBeenCalled();
});

it('exposes the armed chord in the store and clears it on completion', () => {
  register({ key: 'b', chord: { key: 'g' }, description: 'go to board', callback: vi.fn() });
  renderHook(() => useListenHotkey());

  expect(useHotkeysStore.getState().activeChord).toBeNull();

  keydown({ key: 'g' });
  expect(useHotkeysStore.getState().activeChord).toBe('g');

  keydown({ key: 'b' });
  expect(useHotkeysStore.getState().activeChord).toBeNull();
});
