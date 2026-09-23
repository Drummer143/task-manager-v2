import { describe, expect, it } from 'vitest';
import { formatKeys, parseKeys, toInlineText, toSpokenText } from './formatKeys';

const labels = (keys: string, platform: 'mac' | 'other') =>
  formatKeys(keys, platform).map((step) => step.map((key) => key.label));

describe('parseKeys', () => {
  it('reads a single key as one step of one key', () => {
    expect(parseKeys('s')).toEqual([['s']]);
  });

  it('splits a combo on +', () => {
    expect(parseKeys('mod+shift+c')).toEqual([['mod', 'shift', 'c']]);
  });

  it('splits a sequence on whitespace, tolerating extra spaces', () => {
    expect(parseKeys('  g   b ')).toEqual([['g'], ['b']]);
  });

  it('lower-cases input so notation is case-insensitive', () => {
    expect(parseKeys('Mod+K')).toEqual([['mod', 'k']]);
  });

  it('supports the + key itself', () => {
    expect(parseKeys('+')).toEqual([['+']]);
    expect(parseKeys('mod++')).toEqual([['mod', '+']]);
  });

  it('returns nothing for empty notation', () => {
    expect(parseKeys('')).toEqual([]);
    expect(parseKeys('   ')).toEqual([]);
  });
});

describe('formatKeys', () => {
  it('maps mod to ⌘ on mac and Ctrl elsewhere', () => {
    expect(labels('mod+k', 'mac')).toEqual([['⌘', 'K']]);
    expect(labels('mod+k', 'other')).toEqual([['Ctrl', 'K']]);
  });

  it('uses glyphs for every modifier on mac and words elsewhere', () => {
    expect(labels('ctrl+alt+shift+meta+x', 'mac')).toEqual([['⌃', '⌥', '⇧', '⌘', 'X']]);
    expect(labels('ctrl+alt+shift+meta+x', 'other')).toEqual([['Ctrl', 'Alt', 'Shift', 'Win', 'X']]);
  });

  it('keeps the author’s modifier order', () => {
    expect(labels('mod+shift+c', 'mac')).toEqual([['⌘', '⇧', 'C']]);
    expect(labels('shift+mod+c', 'mac')).toEqual([['⇧', '⌘', 'C']]);
  });

  it('names special keys', () => {
    expect(labels('esc enter space tab', 'other')).toEqual([['Esc'], ['Enter'], ['Space'], ['Tab']]);
    expect(labels('up down left right', 'other')).toEqual([['↑'], ['↓'], ['←'], ['→']]);
    expect(labels('arrowup escape', 'other')).toEqual([['↑'], ['Esc']]);
  });

  it('upper-cases letters, capitalizes F-keys and leaves punctuation', () => {
    expect(labels('c f2 / ?', 'other')).toEqual([['C'], ['F2'], ['/'], ['?']]);
  });
});

describe('toInlineText', () => {
  it('joins the keys of a combo without a separator', () => {
    expect(toInlineText(formatKeys('mod+k', 'mac'))).toBe('⌘K');
    expect(toInlineText(formatKeys('mod+shift+c', 'mac'))).toBe('⌘⇧C');
    expect(toInlineText(formatKeys('mod+enter', 'mac'))).toBe('⌘Enter');
    expect(toInlineText(formatKeys('mod+shift+c', 'other'))).toBe('CtrlShiftC');
  });

  it('separates sequence steps with ›', () => {
    expect(toInlineText(formatKeys('g b', 'mac'))).toBe('G›B');
    expect(toInlineText(formatKeys('mod+k s', 'mac'))).toBe('⌘K›S');
  });

  it('renders a single key as is', () => {
    expect(toInlineText(formatKeys('esc', 'mac'))).toBe('Esc');
  });
});

describe('toSpokenText', () => {
  it('spells modifiers out and joins sequence steps with the then label', () => {
    expect(toSpokenText(formatKeys('mod+shift+c', 'mac'), 'then')).toBe('Command+Shift+C');
    expect(toSpokenText(formatKeys('g b', 'mac'), 'then')).toBe('G then B');
    expect(toSpokenText(formatKeys('up', 'other'), 'then')).toBe('Up arrow');
  });
});
