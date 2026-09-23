import { useEffect } from 'react';
import { getHotkeyCombinationString, HotkeyHandlerConfig, useHotkeysStore } from '../hotkeys';

/**
 * Registers a hotkey for the lifetime of the component. The registry key is
 * derived from the config (combo, or `accord > key` for a chord), so callers
 * describe the hotkey once and never build the string by hand.
 *
 * Memoize `config` (or its identity) to avoid re-registering every render.
 */
export const useRegisterHotkey = (config: HotkeyHandlerConfig) =>
  useEffect(
    () =>
      useHotkeysStore
        .getState()
        .registerHotkey(getHotkeyCombinationString(config), config),
    [config],
  );
