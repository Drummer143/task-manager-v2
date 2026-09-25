import { describe, expect, it } from 'vitest';
import { isTooltipPlacement, placeTooltip } from './placeTooltip';

const VIEWPORT = { width: 1000, height: 800 };
const TIP = { width: 100, height: 24 };
const GAP = 6;
const PAD = 8;

/** A 40×32 trigger whose top-left corner is at (left, top). */
const trigger = (left: number, top: number, width = 40, height = 32) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

const place = (rect: DOMRect, preferred: Parameters<typeof placeTooltip>[2], tip = TIP) =>
  placeTooltip(rect, tip, preferred, GAP, PAD, VIEWPORT);

describe('placeTooltip · preferred side', () => {
  it('top: above the trigger, centered on it', () => {
    expect(place(trigger(480, 400), 'top')).toEqual({ x: 450, y: 400 - GAP - 24, placement: 'top' });
  });

  it('bottom: below the trigger', () => {
    expect(place(trigger(480, 400), 'bottom')).toEqual({ x: 450, y: 432 + GAP, placement: 'bottom' });
  });

  it('left: to the left, centered vertically', () => {
    expect(place(trigger(480, 400), 'left')).toEqual({ x: 480 - GAP - 100, y: 404, placement: 'left' });
  });

  it('right: to the right, centered vertically', () => {
    expect(place(trigger(480, 400), 'right')).toEqual({ x: 520 + GAP, y: 404, placement: 'right' });
  });
});

describe('placeTooltip · flip', () => {
  it('top at the top of the window flips below', () => {
    expect(place(trigger(480, 10), 'top').placement).toBe('bottom');
  });

  it('bottom at the bottom of the window flips above', () => {
    expect(place(trigger(480, 760), 'bottom').placement).toBe('top');
  });

  it('right at the right edge flips to the left', () => {
    const result = place(trigger(950, 400), 'right');

    expect(result.placement).toBe('left');
    expect(result.x).toBe(950 - GAP - 100);
  });

  it('left at the left edge flips to the right', () => {
    expect(place(trigger(5, 400), 'left').placement).toBe('right');
  });

  it('counts the viewport padding: touching the edge is not "fits"', () => {
    // Exactly tooltip + gap above the trigger, but no room for the padding.
    expect(place(trigger(480, 24 + GAP), 'top').placement).toBe('bottom');
    expect(place(trigger(480, 24 + GAP + PAD), 'top').placement).toBe('top');
  });

  it('when neither side fits, takes the roomier one', () => {
    const tall = { width: 100, height: 500 };

    expect(place(trigger(480, 300, 40, 32), 'top', tall).placement).toBe('bottom'); // 300 above < 468 below
    expect(place(trigger(480, 460, 40, 32), 'bottom', tall).placement).toBe('top'); // 308 below < 460 above
  });
});

describe('placeTooltip · shift inside the viewport', () => {
  it('shifts right at the left edge, keeping the padding', () => {
    expect(place(trigger(0, 400), 'top').x).toBe(PAD);
  });

  it('shifts left at the right edge, keeping the padding', () => {
    expect(place(trigger(980, 400, 20), 'top').x).toBe(1000 - PAD - 100);
  });

  it('shifts up for a side tooltip at the bottom edge', () => {
    expect(place(trigger(480, 790, 40, 10), 'right').y).toBe(800 - PAD - 24);
  });
});

describe('placeTooltip · pixels', () => {
  it('rounds to whole pixels so text stays sharp', () => {
    const result = place(trigger(480.3, 400.7, 41), 'top');

    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
  });
});

describe('isTooltipPlacement', () => {
  it('accepts the four sides only', () => {
    expect(['top', 'bottom', 'left', 'right'].every(isTooltipPlacement)).toBe(true);
    expect(isTooltipPlacement('center')).toBe(false);
    expect(isTooltipPlacement(null)).toBe(false);
  });
});
