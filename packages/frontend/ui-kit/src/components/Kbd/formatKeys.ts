import type { KeyPlatform } from '../../utils';

/**
 * One key as shown to the user: `label` is what is drawn (⌘, Ctrl, ↑, K),
 * `spoken` is what a screen reader announces (Command, Ctrl, Up arrow, K).
 */
export interface FormattedKey {
  label: string;
  spoken: string;
}

/** Keys pressed together. */
export type FormattedStep = FormattedKey[];

type KeyName = readonly [label: string, spoken: string];

const MODIFIERS: Record<KeyPlatform, Record<string, KeyName>> = {
  mac: {
    mod: ['⌘', 'Command'],
    meta: ['⌘', 'Command'],
    cmd: ['⌘', 'Command'],
    ctrl: ['⌃', 'Control'],
    alt: ['⌥', 'Option'],
    option: ['⌥', 'Option'],
    shift: ['⇧', 'Shift'],
  },
  other: {
    mod: ['Ctrl', 'Ctrl'],
    meta: ['Win', 'Windows'],
    cmd: ['Ctrl', 'Ctrl'],
    ctrl: ['Ctrl', 'Ctrl'],
    alt: ['Alt', 'Alt'],
    option: ['Alt', 'Alt'],
    shift: ['Shift', 'Shift'],
  },
};

const NAMED_KEYS: Record<string, KeyName> = {
  esc: ['Esc', 'Escape'],
  escape: ['Esc', 'Escape'],
  enter: ['Enter', 'Enter'],
  return: ['Enter', 'Enter'],
  space: ['Space', 'Space'],
  tab: ['Tab', 'Tab'],
  backspace: ['Backspace', 'Backspace'],
  delete: ['Del', 'Delete'],
  del: ['Del', 'Delete'],
  up: ['↑', 'Up arrow'],
  arrowup: ['↑', 'Up arrow'],
  down: ['↓', 'Down arrow'],
  arrowdown: ['↓', 'Down arrow'],
  left: ['←', 'Left arrow'],
  arrowleft: ['←', 'Left arrow'],
  right: ['→', 'Right arrow'],
  arrowright: ['→', 'Right arrow'],
  home: ['Home', 'Home'],
  end: ['End', 'End'],
  pageup: ['PgUp', 'Page up'],
  pagedown: ['PgDn', 'Page down'],
  plus: ['+', 'Plus'],
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Split the kit's key notation into steps of keys, lower-cased.
 * `mod+shift+c` — one step (combo); `g b` — two steps (sequence).
 * `+` itself is written as `plus`, or as a trailing `+` (`mod++`).
 */
export const parseKeys = (keys: string): string[][] =>
  keys
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((step) => {
      const lower = step.toLowerCase();

      if (lower === '+') {
        return ['+'];
      }

      if (lower.endsWith('++')) {
        return [...lower.slice(0, -2).split('+').filter(Boolean), '+'];
      }

      return lower.split('+').filter(Boolean);
    })
    .filter((step) => step.length > 0);

const formatKey = (key: string, platform: KeyPlatform): FormattedKey => {
  const modifier = MODIFIERS[platform][key];

  if (modifier) {
    return { label: modifier[0], spoken: modifier[1] };
  }

  const named = NAMED_KEYS[key];

  if (named) {
    return { label: named[0], spoken: named[1] };
  }

  // Letters and F-keys read upper-case (K, F2); punctuation stays as is (/, ?).
  const label = key.length === 1 ? key.toUpperCase() : capitalize(key);

  return { label, spoken: label };
};

export const formatKeys = (keys: string, platform: KeyPlatform): FormattedStep[] =>
  parseKeys(keys).map((step) => step.map((key) => formatKey(key, platform)));

/** Between the steps of a sequence in inline text (`G›B`). */
export const INLINE_SEQUENCE_SEPARATOR = '›';

/** Inline text of one step: keys joined without a separator (`⌘⇧C`, `CtrlK`). */
export const stepToInlineText = (step: FormattedStep) => step.map((key) => key.label).join('');

/** Inline text of the whole notation: `C`, `⌘K`, `G›B`, `⌘K›S`. */
export const toInlineText = (steps: FormattedStep[]) =>
  steps.map(stepToInlineText).join(INLINE_SEQUENCE_SEPARATOR);

/** Screen-reader text: `Command+Shift+C`, `G then B`. */
export const toSpokenText = (steps: FormattedStep[], thenLabel: string) =>
  steps.map((step) => step.map((key) => key.spoken).join('+')).join(` ${thenLabel} `);
