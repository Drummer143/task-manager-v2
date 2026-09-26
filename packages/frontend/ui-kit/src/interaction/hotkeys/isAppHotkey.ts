import { getChordPrefixes } from './chords';
import { getEventHotkeyString } from './helpers';
import { useHotkeysStore } from './store';

/**
 * Whether the app has claimed this key: a hotkey (J, K, S…) or the first step
 * of a sequence (G in "g b"). A widget that gives plain letters a meaning of
 * its own — an inline cell starting an edit, a tree jumping to a node — leaves
 * these to the app: the registry says which.
 */
export const isAppHotkey = (event: KeyboardEvent) => {
  const { hotkeys, getHotkeyHandler } = useHotkeysStore.getState();
  const step = getEventHotkeyString(event);

  return getHotkeyHandler(step) !== undefined || getChordPrefixes(Object.keys(hotkeys)).has(step);
};
