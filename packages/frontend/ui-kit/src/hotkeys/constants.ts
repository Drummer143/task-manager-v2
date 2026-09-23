/** Joins keys of a single step (combo). Order-independent → keys are sorted. */
export const HOTKEY_KEY_SEPARATOR = ' + ';

/** Joins the steps of a chord (`G` then `B`). Order-DEPENDENT → never sorted. */
export const HOTKEY_SEQUENCE_SEPARATOR = ' > ';

/** How long a chord prefix stays armed, waiting for the next step. */
export const HOTKEY_CHORD_WINDOW_MS = 1000;
