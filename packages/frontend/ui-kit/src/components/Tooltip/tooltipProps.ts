import {
  DATA_ATTR_TOOLTIP,
  DATA_ATTR_TOOLTIP_DELAY,
  DATA_ATTR_TOOLTIP_KEYS,
  DATA_ATTR_TOOLTIP_OVERFLOW,
  DATA_ATTR_TOOLTIP_PLACEMENT,
  DATA_ATTR_TOOLTIP_REASON,
} from './constants';
import type { TooltipPlacement } from './types';

interface TooltipOptions {
  /** Kbd notation shown after the text (`'c'`, `'mod+k'`). */
  keys?: string;
  /** Preferred side; flips to the opposite one at the window edge. Default `top`. */
  placement?: TooltipPlacement;
  /** Hover delay override, ms. Default `--tooltip-delay`. */
  delay?: number;
}

export type TooltipInfo = TooltipOptions &
  (
    | { text: string; overflow?: false; reason?: never }
    /** Only when the element's own text is truncated; `text` defaults to that text. */
    | { text?: string; overflow: true; reason?: never }
    /** Disabled trigger: the reason is always shown, instead of any text. */
    | { reason: string; text?: string; overflow?: never }
  );

type TooltipAttributes = {
  [name: `data-tooltip${string}`]: string | number | undefined;
};

/**
 * Attributes that make an element a tooltip trigger. Spread them onto the DOM
 * element the tooltip should point at; one `<TooltipHost />` does the rest.
 */
export const tooltipProps = (info: TooltipInfo): TooltipAttributes => ({
  [DATA_ATTR_TOOLTIP]: info.text ?? '',
  [DATA_ATTR_TOOLTIP_OVERFLOW]: info.overflow ? '' : undefined,
  [DATA_ATTR_TOOLTIP_KEYS]: info.keys,
  [DATA_ATTR_TOOLTIP_REASON]: info.reason,
  [DATA_ATTR_TOOLTIP_PLACEMENT]: info.placement,
  [DATA_ATTR_TOOLTIP_DELAY]: info.delay,
});
