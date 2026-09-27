export interface NotifyContext {
  /** The app's policy let it through (its kind, not in the inbox, not open, not quiet). */
  allowed: boolean;
  /** `document.visibilityState === 'visible'`: what comes to a hidden tab stays in the counter. */
  tabVisible: boolean;
  /** A notification toast is on screen now. */
  showing: boolean;
  /** The same notification is already on screen. */
  duplicate: boolean;
  now: number;
  /** When the last one was shown, or null. */
  lastShownAt: number | null;
  /** --notify-gap. */
  gap: number;
}

/** Show it; add "+1 more" to the one on screen; or leave it to the inbox. */
export type NotifyDecision = 'show' | 'more' | 'skip';

/**
 * Whether a notification interrupts (spec: Toast · 07). Everything that does
 * not pass silently stays in the inbox. While one is shown, suitable new ones
 * only add a "+N more" line — and nothing they add is shown after it goes.
 */
export const shouldNotify = (context: NotifyContext): NotifyDecision => {
  if (!context.allowed || !context.tabVisible || context.duplicate) {
    return 'skip';
  }

  if (context.showing) {
    return 'more';
  }

  if (context.lastShownAt !== null && context.now - context.lastShownAt < context.gap) {
    return 'skip';
  }

  return 'show';
};
