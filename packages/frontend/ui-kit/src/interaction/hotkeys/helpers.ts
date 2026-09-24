import { HOTKEY_KEY_SEPARATOR, HOTKEY_SEQUENCE_SEPARATOR } from './constants';
import { HotkeyHandlerConfig, HotkeyConfig } from './types';

const applyLayerKeys = (
  keys: string[],
  layerKeys: Omit<HotkeyConfig, 'key'>,
) => {
  if (layerKeys.ctrl) {
    keys.push('Control');
  }

  if (layerKeys.shift) {
    keys.push('Shift');
  }

  if (layerKeys.alt) {
    keys.push('Alt');
  }

  if (layerKeys.meta) {
    keys.push('Meta');
  }
};

/** Order-independent string for one step: modifiers + key, sorted. */
export const combineKeys = (keys: string[]) =>
  [...keys].sort().join(HOTKEY_KEY_SEPARATOR);

/** One step (modifiers + key) → its normalized combo string. */
const stepToString = (step: HotkeyConfig) => {
  const keys: string[] = [];

  applyLayerKeys(keys, {
    ctrl: step.ctrl,
    shift: step.shift,
    alt: step.alt,
    meta: step.meta,
  });

  keys.push(step.key);

  return combineKeys(keys);
};

export const parseEventToHotkey = (event: KeyboardEvent) => {
  const keys: string[] = [];

  applyLayerKeys(keys, {
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  });

  keys.push(event.key);

  return keys;
};

/** The one event's normalized combo string. */
export const getEventHotkeyString = (event: KeyboardEvent) =>
  combineKeys(parseEventToHotkey(event));

/**
 * The registry key for a config. A plain combo is one step; a chord is
 * `accord-step > final-step` — steps are sorted internally but their order in
 * the sequence is preserved.
 */
export const getHotkeyCombinationString = (config: HotkeyHandlerConfig) => {
  const finalStep = stepToString(config);

  if (config.chord) {
    return stepToString(config.chord) + HOTKEY_SEQUENCE_SEPARATOR + finalStep;
  }

  return finalStep;
};
