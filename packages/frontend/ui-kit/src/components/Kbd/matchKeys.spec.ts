import { describe, expect, it } from 'vitest';
import { matchKeys } from './matchKeys';

const press = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('matchKeys', () => {
  it('matches a single letter, case-insensitively, and not with a modifier', () => {
    expect(matchKeys('s', press('s'))).toBe(true);
    expect(matchKeys('s', press('S', { shiftKey: true }))).toBe(false);
    expect(matchKeys('s', press('s', { ctrlKey: true }))).toBe(false);
    expect(matchKeys('s', press('a'))).toBe(false);
  });

  it('reads mod as ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(matchKeys('mod+backspace', press('Backspace', { metaKey: true }), 'mac')).toBe(true);
    expect(matchKeys('mod+backspace', press('Backspace', { ctrlKey: true }), 'mac')).toBe(false);
    expect(matchKeys('mod+backspace', press('Backspace', { ctrlKey: true }), 'other')).toBe(true);
  });

  it('matches combos and named keys through their aliases', () => {
    expect(matchKeys('mod+shift+c', press('C', { ctrlKey: true, shiftKey: true }), 'other')).toBe(true);
    expect(matchKeys('esc', press('Escape'))).toBe(true);
    expect(matchKeys('shift+up', press('ArrowUp', { shiftKey: true }))).toBe(true);
  });

  it('lets a printed symbol carry its own Shift', () => {
    expect(matchKeys('?', press('?', { shiftKey: true }))).toBe(true);
    expect(matchKeys('shift+?', press('?', { shiftKey: true }))).toBe(true);
  });

  it('never matches a sequence or modifiers alone', () => {
    expect(matchKeys('g b', press('b'))).toBe(false);
    expect(matchKeys('mod', press('Control', { ctrlKey: true }), 'other')).toBe(false);
  });
});
