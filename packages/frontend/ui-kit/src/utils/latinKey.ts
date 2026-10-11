const LETTER_KEY = /^Key([A-Z])$/;

/**
 * The key a hotkey reads from a press: `event.key`, except for a letter of a non-Latin layout
 * (Cyrillic, Greek…), which becomes the Latin letter on the same physical key (`event.code`), so
 * E, U, J, K and ⌘Z work whatever the layout. A Latin layout (Dvorak, AZERTY) keeps its own
 * letters: there a hotkey is the letter it prints, not the place of the key.
 */
export const latinKey = (event: { key: string; code?: string }) => {
  const { key, code } = event;
  const foreignLetter = key.length === 1 && /\p{L}/u.test(key) && !/[a-z]/i.test(key);
  const physical = foreignLetter && code ? LETTER_KEY.exec(code) : null;

  return physical ? physical[1].toLowerCase() : key;
};
