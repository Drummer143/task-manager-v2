import { HOTKEY_SEQUENCE_SEPARATOR } from './constants';

/**
 * Chord = an ordered sequence of steps (`G` then `B`), distinct from a combo
 * (`Meta + K`, simultaneous). The machine below is a pure reducer: it takes the
 * current state, the step just pressed and the clock, and returns the next
 * state plus what the listener should do. Keeping it pure makes it testable
 * without timers or the DOM.
 */

export interface ChordState {
  /** The step string of an armed prefix, or null when idle. */
  prefix: string | null;
  /** When the prefix was armed (ms), to compare against the window. */
  armedAt: number;
}

export const IDLE_CHORD_STATE: ChordState = { prefix: null, armedAt: 0 };

export type ChordAction =
  /** Not part of a chord — let normal combo handling proceed. */
  | { type: 'none' }
  /** This step armed a chord prefix — consume it (preventDefault), wait. */
  | { type: 'arm' }
  /** A chord completed — fire this registry key. */
  | { type: 'fire'; key: string };

export interface ChordDeps {
  windowMs: number;
  /** Does `step` start some registered chord? */
  isPrefix: (step: string) => boolean;
  /** Is `key` a registered (complete) chord? */
  hasChord: (key: string) => boolean;
}

/** Build the registry key for a completed chord from its two steps. */
export const chordKey = (prefix: string, step: string) =>
  prefix + HOTKEY_SEQUENCE_SEPARATOR + step;

/** The set of first steps across all registered chord keys. */
export const getChordPrefixes = (registryKeys: string[]): Set<string> => {
  const prefixes = new Set<string>();

  for (const key of registryKeys) {
    const index = key.indexOf(HOTKEY_SEQUENCE_SEPARATOR);

    if (index !== -1) {
      prefixes.add(key.slice(0, index));
    }
  }

  return prefixes;
};

export interface ChordResult {
  state: ChordState;
  action: ChordAction;
}

export const reduceChord = (
  state: ChordState,
  step: string,
  now: number,
  deps: ChordDeps,
): ChordResult => {
  const armed = state.prefix !== null && now - state.armedAt <= deps.windowMs;

  if (armed) {
    const candidate = chordKey(state.prefix as string, step);

    if (deps.hasChord(candidate)) {
      return { state: IDLE_CHORD_STATE, action: { type: 'fire', key: candidate } };
    }

    // The prefix did not complete a chord — drop it and reconsider `step` fresh.
  }

  if (deps.isPrefix(step)) {
    return { state: { prefix: step, armedAt: now }, action: { type: 'arm' } };
  }

  return { state: IDLE_CHORD_STATE, action: { type: 'none' } };
};
