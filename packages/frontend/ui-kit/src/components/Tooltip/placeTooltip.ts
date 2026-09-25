import type { TooltipPlacement } from './types';

export interface Size {
  width: number;
  height: number;
}

const OPPOSITE: Record<TooltipPlacement, TooltipPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

export const isTooltipPlacement = (value: string | null): value is TooltipPlacement =>
  value !== null && value in OPPOSITE;

const isVertical = (placement: TooltipPlacement) => placement === 'top' || placement === 'bottom';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Free space between the trigger and the viewport edge on each side. */
const room = (placement: TooltipPlacement, trigger: DOMRect, viewport: Size) =>
  ({
    top: trigger.top,
    bottom: viewport.height - trigger.bottom,
    left: trigger.left,
    right: viewport.width - trigger.right,
  })[placement];

/**
 * Preferred side, flipped to the opposite one when it does not fit there but
 * does fit opposite (neither fits — the roomier one); centered on the cross
 * axis and shifted inside the viewport. Whole pixels, so text stays sharp.
 */
export const placeTooltip = (
  trigger: DOMRect,
  tooltipSize: Size,
  preferred: TooltipPlacement,
  gap: number,
  viewportPadding: number,
  viewport: Size = { width: window.innerWidth, height: window.innerHeight },
) => {
  const need = (placement: TooltipPlacement) =>
    (isVertical(placement) ? tooltipSize.height : tooltipSize.width) + gap + viewportPadding;
  const fits = (placement: TooltipPlacement) => room(placement, trigger, viewport) >= need(placement);

  const opposite = OPPOSITE[preferred];
  const placement =
    fits(preferred) ||
    (!fits(opposite) && room(preferred, trigger, viewport) >= room(opposite, trigger, viewport))
      ? preferred
      : opposite;

  let x: number;
  let y: number;

  if (isVertical(placement)) {
    x = clamp(
      trigger.left + trigger.width / 2 - tooltipSize.width / 2,
      viewportPadding,
      viewport.width - viewportPadding - tooltipSize.width,
    );
    y = placement === 'top' ? trigger.top - gap - tooltipSize.height : trigger.bottom + gap;
  } else {
    y = clamp(
      trigger.top + trigger.height / 2 - tooltipSize.height / 2,
      viewportPadding,
      viewport.height - viewportPadding - tooltipSize.height,
    );
    x = placement === 'left' ? trigger.left - gap - tooltipSize.width : trigger.right + gap;
  }

  return { x: Math.round(x), y: Math.round(y), placement };
};
