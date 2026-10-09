import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useListenHotkey } from './useListenHotkey';
import { getHotkeyCombinationString, HotkeyHandlerConfig, useHotkeysStore } from '../hotkeys';

const register = (config: HotkeyHandlerConfig) =>
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

it('leaves a key a widget already handled: one press, one action', () => {
  const callback = vi.fn();
  register({ key: 'ArrowDown', description: 'next row', callback });
  renderHook(() => useListenHotkey());

  // A radio group took its arrow (preventDefault), and the page's own hotkey does not fire too
  const radios = document.createElement('div');
  radios.addEventListener('keydown', (event) => event.preventDefault());
  document.body.append(radios);
  radios.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  radios.remove();
  expect(callback).not.toHaveBeenCalled();

  keydown({ key: 'ArrowDown' });
  expect(callback).toHaveBeenCalledOnce();
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

describe('one spelling per key', () => {
  it('a letter with Shift: written either case, fired by Shift + the key', () => {
    const lower = vi.fn();
    const plain = vi.fn();
    register({ key: 'u', shift: true, description: 'read all', callback: lower });
    register({ key: 'u', description: 'read', callback: plain });
    renderHook(() => useListenHotkey());

    // The browser reports Shift + U as 'U'
    keydown({ key: 'U', shiftKey: true });
    expect(lower).toHaveBeenCalledOnce();
    expect(plain).not.toHaveBeenCalled();

    keydown({ key: 'u' });
    expect(plain).toHaveBeenCalledOnce();
    expect(lower).toHaveBeenCalledOnce();
  });

  it('an upper-case key in a config is the same letter, not a hidden Shift', () => {
    const callback = vi.fn();
    register({ key: 'E', description: 'archive', callback });
    renderHook(() => useListenHotkey());

    keydown({ key: 'e' });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('Caps Lock does not turn a letter into another hotkey', () => {
    const callback = vi.fn();
    register({ key: 'e', description: 'archive', callback });
    renderHook(() => useListenHotkey());

    keydown({ key: 'E' });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('a printed sign already carries its Shift: "?" fires on Shift + /', () => {
    const callback = vi.fn();
    register({ key: '?', description: 'cheatsheet', callback });
    renderHook(() => useListenHotkey());

    keydown({ key: '?', shiftKey: true });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('a named key keeps its Shift', () => {
    const plain = vi.fn();
    const shifted = vi.fn();
    register({ key: 'Enter', description: 'open', callback: plain });
    register({ key: 'Enter', shift: true, description: 'join', callback: shifted });
    renderHook(() => useListenHotkey());

    keydown({ key: 'Enter', shiftKey: true });
    expect(shifted).toHaveBeenCalledOnce();
    expect(plain).not.toHaveBeenCalled();
  });
});
