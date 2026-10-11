import { describe, expect, it } from 'vitest';
import { latinKey } from './latinKey';

describe('latinKey', () => {
  it.each([
    ['a Cyrillic letter is the Latin one on its key', { key: 'у', code: 'KeyE' }, 'e'],
    ['in upper case too', { key: 'Г', code: 'KeyU' }, 'u'],
    ['a Greek letter as well', { key: 'ε', code: 'KeyE' }, 'e'],
    ['a Latin letter stays: Dvorak prints the letter it means', { key: 'e', code: 'KeyD' }, 'e'],
    ['a sign stays, also on a letter key of another layout', { key: '?', code: 'Comma' }, '?'],
    ['a named key stays', { key: 'ArrowDown', code: 'ArrowDown' }, 'ArrowDown'],
    ['a non-Latin letter off the letter keys stays', { key: 'é', code: 'Digit2' }, 'é'],
    ['without a code, the key as it is', { key: 'у' }, 'у'],
  ])('%s', (_, event, expected) => {
    expect(latinKey(event)).toBe(expected);
  });
});
