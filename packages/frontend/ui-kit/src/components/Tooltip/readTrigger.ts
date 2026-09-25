import { raw } from '../../tokens';
import {
  DATA_ATTR_TOOLTIP,
  DATA_ATTR_TOOLTIP_DELAY,
  DATA_ATTR_TOOLTIP_KEYS,
  DATA_ATTR_TOOLTIP_OVERFLOW,
  DATA_ATTR_TOOLTIP_PLACEMENT,
  DATA_ATTR_TOOLTIP_REASON,
} from './constants';
import { isTooltipPlacement } from './placeTooltip';
import type { TooltipContent } from './types';

/** Ellipsis on one line or line-clamp on several — both leave hidden overflow. */
const isTruncated = (element: Element) =>
  element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;

/**
 * `getAttribute` returns null for a missing attribute, and Number(null) is 0 —
 * so parse explicitly, or a missing delay silently becomes "instant".
 */
const readDelay = (element: Element) => {
  const value = element.getAttribute(DATA_ATTR_TOOLTIP_DELAY);
  const parsed = value === null || value === '' ? NaN : Number(value);

  return Number.isFinite(parsed) ? parsed : raw['tooltip-delay'];
};

/**
 * What to show for a trigger, or null when there is nothing to show (empty
 * text, or an overflow trigger whose text fits). Reads layout only for
 * overflow triggers, and only when called — on hover, for one element.
 */
export const readTrigger = (element: Element): TooltipContent | null => {
  const placementValue = element.getAttribute(DATA_ATTR_TOOLTIP_PLACEMENT);
  const placement = isTooltipPlacement(placementValue) ? placementValue : 'top';
  const delay = readDelay(element);

  const reason = element.getAttribute(DATA_ATTR_TOOLTIP_REASON);

  if (reason) {
    return { text: reason, placement, delay };
  }

  let text = element.getAttribute(DATA_ATTR_TOOLTIP) ?? '';

  if (element.hasAttribute(DATA_ATTR_TOOLTIP_OVERFLOW)) {
    if (!isTruncated(element)) {
      return null;
    }

    text ||= element.textContent?.trim() ?? '';
  }

  if (!text) {
    return null;
  }

  const keys = element.getAttribute(DATA_ATTR_TOOLTIP_KEYS) || undefined;

  return { text, keys, placement, delay };
};
