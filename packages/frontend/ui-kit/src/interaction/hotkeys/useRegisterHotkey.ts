import { useEffect, useLayoutEffect, useRef } from 'react';
import { HotkeyHandlerConfig } from './types';
import { useHotkeysStore } from './store';
import { getHotkeyCombinationString } from './helpers';

/**
 * Registers a hotkey for the lifetime of the component. The registry key is
 * derived from the config (combo, or `accord > key` for a chord), so callers
 * describe the hotkey once and never build the string by hand.
 *
 * Registered once per combination: a new `config` object or `callback` every render is fine,
 * the key calls the latest one. Re-registering would also move the hotkey to the top of its
 * key's registrations, ahead of a menu or a dialog that took the key after it.
 */
export const useRegisterHotkey = (config: HotkeyHandlerConfig) => {
  const combination = getHotkeyCombinationString(config);
  const latest = useRef(config);

  useLayoutEffect(() => {
    latest.current = config;
  });

  useEffect(
    () =>
      useHotkeysStore.getState().registerHotkey(combination, {
        ...latest.current,
        callback: (event) => latest.current.callback(event),
      }),
    [combination],
  );
};
