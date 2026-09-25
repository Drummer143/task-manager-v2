/** The tooltip text. A trigger has it, a disabled reason, or both. */
export const DATA_ATTR_TOOLTIP = 'data-tooltip';
/** Why the trigger is disabled; replaces the text. */
export const DATA_ATTR_TOOLTIP_REASON = 'data-tooltip-reason';
export const DATA_ATTR_TOOLTIP_KEYS = 'data-tooltip-keys';
export const DATA_ATTR_TOOLTIP_DELAY = 'data-tooltip-delay';
export const DATA_ATTR_TOOLTIP_PLACEMENT = 'data-tooltip-placement';
/** Show only when the trigger's own text is truncated; the text is taken from the element. */
export const DATA_ATTR_TOOLTIP_OVERFLOW = 'data-tooltip-overflow';

export const TRIGGER_SELECTOR = `[${DATA_ATTR_TOOLTIP}],[${DATA_ATTR_TOOLTIP_REASON}]`;

/** The one tooltip element; triggers point at it (or its keys) with aria-describedby. */
export const TOOLTIP_ID = 'tooltip';
export const TOOLTIP_KEYS_ID = 'tooltip-keys';

/** Attributes whose change while a tooltip is shown must refresh (or close) it. */
export const WATCHED_ATTRIBUTES = [
  DATA_ATTR_TOOLTIP,
  DATA_ATTR_TOOLTIP_REASON,
  DATA_ATTR_TOOLTIP_KEYS,
  DATA_ATTR_TOOLTIP_PLACEMENT,
  'aria-expanded',
];
