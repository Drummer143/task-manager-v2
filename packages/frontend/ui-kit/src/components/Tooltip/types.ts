export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/** What the host shows, read from a trigger's attributes. */
export interface TooltipContent {
  text: string;
  /** Kbd notation (`'mod+k'`, `'g b'`); never shown together with a disabled reason. */
  keys?: string;
  placement: TooltipPlacement;
  /** The text is a disabled reason: it describes the trigger as a whole. */
  isReason?: boolean;
  /** Hover delay for this trigger, ms. Keyboard focus ignores it. */
  delay: number;
}
