export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/** What the host shows, read from a trigger's attributes. */
export interface TooltipContent {
  text: string;
  /** Kbd notation (`'mod+k'`, `'g b'`); never shown together with a disabled reason. */
  keys?: string;
  placement: TooltipPlacement;
  /** Hover delay for this trigger, ms. Keyboard focus ignores it. */
  delay: number;
}
