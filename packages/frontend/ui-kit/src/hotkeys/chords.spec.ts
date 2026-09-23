import { describe, expect, it } from 'vitest';
import {
  chordKey,
  getChordPrefixes,
  IDLE_CHORD_STATE,
  reduceChord,
  type ChordDeps,
} from './chords';
import { getHotkeyCombinationString } from './helpers';

const deps = (over: Partial<ChordDeps> = {}): ChordDeps => ({
  windowMs: 1000,
  isPrefix: (step) => step === 'g',
  hasChord: (key) => key === 'g > b',
  ...over,
});

describe('chord machine', () => {
  it('arms when a step is a registered prefix', () => {
    const result = reduceChord(IDLE_CHORD_STATE, 'g', 0, deps());
    expect(result.action).toEqual({ type: 'arm' });
    expect(result.state).toEqual({ prefix: 'g', armedAt: 0 });
  });

  it('fires when the next step completes the chord within the window', () => {
    const armed = { prefix: 'g', armedAt: 0 };
    const result = reduceChord(armed, 'b', 500, deps());
    expect(result.action).toEqual({ type: 'fire', key: 'g > b' });
    expect(result.state).toEqual(IDLE_CHORD_STATE);
  });

  it('does not fire after the window expires — the step is reconsidered fresh', () => {
    const armed = { prefix: 'g', armedAt: 0 };
    // 'b' arrives too late; 'b' is not a prefix here → nothing fires.
    const result = reduceChord(armed, 'b', 2000, deps());
    expect(result.action).toEqual({ type: 'none' });
    expect(result.state).toEqual(IDLE_CHORD_STATE);
  });

  it('resets when the armed prefix is not completed by the next step', () => {
    const armed = { prefix: 'g', armedAt: 0 };
    const result = reduceChord(armed, 's', 100, deps());
    expect(result.action).toEqual({ type: 'none' });
    expect(result.state).toEqual(IDLE_CHORD_STATE);
  });

  it('re-arms if the un-completing step is itself a prefix', () => {
    const armed = { prefix: 'g', armedAt: 0 };
    const result = reduceChord(armed, 'g', 100, deps());
    expect(result.action).toEqual({ type: 'arm' });
    expect(result.state).toEqual({ prefix: 'g', armedAt: 100 });
  });

  it('passes non-prefix steps through untouched', () => {
    const result = reduceChord(IDLE_CHORD_STATE, 's', 0, deps());
    expect(result.action).toEqual({ type: 'none' });
  });
});

describe('chord helpers', () => {
  it('getChordPrefixes extracts the first step of every chord key', () => {
    const prefixes = getChordPrefixes(['g > b', 'g > t', 'Meta + k', 's']);
    expect(prefixes).toEqual(new Set(['g']));
  });

  it('chordKey matches the registry key from getHotkeyCombinationString', () => {
    const registryKey = getHotkeyCombinationString({
      key: 'b',
      chord: { key: 'g' },
      description: 'go to board',
      callback: () => undefined,
    });
    expect(registryKey).toBe('g > b');
    expect(chordKey('g', 'b')).toBe(registryKey);
  });
});
