import { useEffect } from 'react';
import { ChordState, getChordPrefixes, IDLE_CHORD_STATE, reduceChord } from './chords';
import { useHotkeysStore } from './store';
import { getEventHotkeyString } from './helpers';
import { HOTKEY_CHORD_WINDOW_MS } from './constants';

let listersCount = 0;
let chordState: ChordState = IDLE_CHORD_STATE;

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target as HTMLElement | null)?.isContentEditable === true;

const syncActiveChord = (prefix: string | null) => {
  const store = useHotkeysStore.getState();

  if (store.activeChord !== prefix) {
    store.setActiveChord(prefix);
  }
};

const resetChord = () => {
  chordState = IDLE_CHORD_STATE;
  syncActiveChord(null);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (isTypingTarget(event.target)) {
    return;
  }

  const store = useHotkeysStore.getState();
  const step = getEventHotkeyString(event);
  const prefixes = getChordPrefixes(Object.keys(store.hotkeys));

  const { state, action } = reduceChord(chordState, step, Date.now(), {
    windowMs: HOTKEY_CHORD_WINDOW_MS,
    isPrefix: (candidate) => prefixes.has(candidate),
    hasChord: (key) => store.getHotkeyHandler(key) !== undefined,
  });
  chordState = state;
  syncActiveChord(state.prefix);

  if (action.type === 'arm') {
    event.preventDefault();
    return;
  }

  const key = action.type === 'fire' ? action.key : step;
  const handler = store.getHotkeyHandler(key);

  if (handler) {
    event.preventDefault();
    handler(event);
  }
};

const handleUnmount = () => {
  listersCount--;

  if (listersCount === 0) {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('blur', resetChord);
  }
};

export const useListenHotkey = () => {
  useEffect(() => {
    listersCount++;

    if (listersCount > 1) {
      return handleUnmount;
    }

    resetChord();
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('blur', resetChord);

    return handleUnmount;
  }, []);
};
