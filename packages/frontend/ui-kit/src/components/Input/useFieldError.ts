import { useState } from 'react';

/**
 * Which error a field shows right now (spec 04). The owner decides what is
 * wrong; the field decides when to say it:
 * - an error that arrives while the field is not focused (a submit attempt) shows at once;
 * - one that arrives while typing waits for blur — the field does not flash red mid-word;
 * - an error already on screen follows its text while typing, and goes as soon as it is cleared.
 * No space is reserved under the field: the line appears on blur, not under the caret.
 */
export const useFieldError = (error: string | undefined) => {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(Boolean(error));

  // Adjusted during render, not in an effect: no frame with a stale error.
  if (!error && visible) {
    setVisible(false);
  }

  if (error && !visible && !focused) {
    setVisible(true);
  }

  return {
    shownError: visible ? error : undefined,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
};
