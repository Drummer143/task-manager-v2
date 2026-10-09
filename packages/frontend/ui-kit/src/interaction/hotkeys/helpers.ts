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

/**
 * One spelling for a key, whatever the case it came in: a letter is compared lower-case and its
 * Shift is a modifier of its own ('U' + Shift and 'u' + Shift are one hotkey; Caps Lock does not
 * change a letter's meaning). A printed sign already carries its Shift ('?' is Shift + /), so for
 * it Shift is not a modifier at all: '?' with or without `shift` is one hotkey. Named keys
 * (Enter, ArrowDown) and Space keep their Shift. Kbd's matchKeys reads keys the same way.
 */
const normalizeStep = (step: HotkeyConfig): HotkeyConfig => {
  const { key } = step;

  if (key.length !== 1 || key === ' ') {
    return step;
  }

  const lower = key.toLowerCase();

  // A letter: its case is not information, Shift is
  if (lower !== key.toUpperCase()) {
    return { ...step, key: lower };
  }

  // A printed sign or a digit: whatever produced it, Shift is already in the character
  return { ...step, shift: false };
};

/** Order-independent string for one step: modifiers + key, sorted. */
export const combineKeys = (keys: string[]) =>
  [...keys].sort().join(HOTKEY_KEY_SEPARATOR);

/** One step (modifiers + key) → its normalized combo string. */
const stepToString = (config: HotkeyConfig) => {
  const step = normalizeStep(config);
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
  const step = normalizeStep({
    key: event.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  });
  const keys: string[] = [];

  applyLayerKeys(keys, step);
  keys.push(step.key);

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
