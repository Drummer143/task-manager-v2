import { detectPlatform, type KeyPlatform } from '../../utils';
import { parseKeys } from './formatKeys';

type ModifierFlags = { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean };

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  del: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  plus: '+',
};

/** A modifier token of the notation → the event flag it means on this platform. */
const flagOf = (token: string, platform: KeyPlatform): keyof ModifierFlags | null => {
  switch (token) {
    case 'mod':
    case 'cmd':
      return platform === 'mac' ? 'meta' : 'ctrl';
    case 'meta':
      return 'meta';
    case 'ctrl':
      return 'ctrl';
    case 'alt':
    case 'option':
      return 'alt';
    case 'shift':
      return 'shift';
    default:
      return null;
  }
};

/**
 * Whether a key press is the given keys (`'s'`, `'mod+enter'`, `'shift+?'`).
 * Only a single step: a sequence (`'g b'`) is the hotkey registry's business,
 * not a single press. Modifiers must match exactly, so `s` is not `mod+s`.
 */
export const matchKeys = (
  keys: string,
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  platform: KeyPlatform = detectPlatform(),
) => {
  const steps = parseKeys(keys);

  if (steps.length !== 1) {
    return false;
  }

  const wanted: ModifierFlags = { meta: false, ctrl: false, alt: false, shift: false };
  let key: string | null = null;

  for (const token of steps[0]) {
    const flag = flagOf(token, platform);

    if (flag) {
      wanted[flag] = true;
    } else {
      key = KEY_ALIASES[token] ?? token;
    }
  }

  if (key === null) {
    return false;
  }

  const pressed = event.key.toLowerCase();
  // A printed character already carries Shift (`?` is Shift+/): only named
  // keys and letters compare it, so `shift+?` and `?` both match a `?` press.
  const shiftMatters = key.length > 1 || /[a-z]/.test(key);

  return (
    pressed === key &&
    event.metaKey === wanted.meta &&
    event.ctrlKey === wanted.ctrl &&
    event.altKey === wanted.alt &&
    (!shiftMatters || event.shiftKey === wanted.shift)
  );
};
