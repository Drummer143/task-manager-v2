import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotkeysStore } from './store';
import { parseEventToHotkey } from './helpers';
import { HotkeyConfig } from './types';

const makeConfig = (description: string): HotkeyConfig => ({
  description,
  callback: vi.fn(),
  key: 'k',
});

beforeEach(() => {
  // The store is a module singleton — reset registrations between tests.
  useHotkeysStore.setState({ hotkeys: {} });
});

describe('hotkeys store', () => {
  it('registers a hotkey and resolves its handler', () => {
    const config = makeConfig('palette');
    useHotkeysStore.getState().registerHotkey(['Meta', 'k'], config);

    expect(useHotkeysStore.getState().getHotkeyHandler(['Meta', 'k'])).toBe(config.callback);
  });

  it('normalizes combos so key order does not matter', () => {
    const config = makeConfig('palette');
    useHotkeysStore.getState().registerHotkey(['Meta', 'k'], config);

    expect(useHotkeysStore.getState().getHotkeyHandler(['k', 'Meta'])).toBe(config.callback);
  });

  it('removes a hotkey via the disposer returned by registerHotkey', () => {
    const config = makeConfig('create');
    const dispose = useHotkeysStore.getState().registerHotkey('c', config);

    expect(useHotkeysStore.getState().getHotkeyHandler('c')).toBe(config.callback);
    dispose();
    expect(useHotkeysStore.getState().getHotkeyHandler('c')).toBeUndefined();
  });

  it('unregisterHotkey without a config clears every registration for the key', () => {
    const store = useHotkeysStore.getState();
    store.registerHotkey('s', makeConfig('status'));
    store.registerHotkey('s', makeConfig('status again'));

    store.unregisterHotkey('s');

    expect(useHotkeysStore.getState().getHotkeyHandler('s')).toBeUndefined();
  });

  it('resolves the most recent registration when several share a key (LIFO)', () => {
    const first = makeConfig('first');
    const second = makeConfig('second');
    const store = useHotkeysStore.getState();
    store.registerHotkey('s', first);
    store.registerHotkey('s', second);

    // Last registered wins, so a newly mounted scope overrides a global one.
    expect(useHotkeysStore.getState().getHotkeyHandler('s')).toBe(second.callback);
  });

  it('parseEventToHotkey lists active modifiers then the key', () => {
    const event = {
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
      key: 'k',
    } as unknown as KeyboardEvent;

    expect(parseEventToHotkey(event)).toEqual(['Shift', 'Meta', 'k']);
  });
});
