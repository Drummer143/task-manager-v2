import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import styles from './Resizer.module.scss';

export interface ResizerProps {
  /**
   * Which edge it resizes. `sidebar` — a region on the left: → makes it wider.
   * `panel` — a region on the right: → makes it narrower. Directions follow the
   * screen, not the region.
   */
  side: 'sidebar' | 'panel';
  /** The current width in px. */
  value: number;
  min: number;
  max: number;
  /** Double click and Enter bring it back here. */
  defaultValue: number;
  /** Narrower than this collapses the region, in the same gesture (the sidebar: 140). */
  snapBelow?: number;
  /** The region is collapsed now: dragging it wider than `snapBelow` expands it. */
  collapsed?: boolean;
  /** Every frame of a gesture — the frame writes it straight to the DOM, not to React state. */
  onLive(px: number): void;
  /** The gesture is over (pointer up, key up): now it is state, and remembered. */
  onCommit(px: number): void;
  /** Crossed `snapBelow` during a gesture: collapse (true) or expand (false). */
  onSnap?(collapsed: boolean): void;
  /** The id of the region it resizes. */
  controls: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The nearest ancestor that scrolls vertically. */
const scrollableFrom = (element: Element | null): Element | null => {
  for (let node = element; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }

  return null;
};

/**
 * A border that can be dragged (spec: AppShell · 03). The visible line is the
 * region's own 1 px border; the resizer adds an 8 px grab zone over it and
 * lights the line in accent when it can be worked with — after 150 ms of
 * hover, so a mouse passing by does not make it blink. Pointer, keyboard (←→,
 * Shift for big steps, Home/End, Enter to reset) and double click.
 */
export const Resizer: React.FC<ResizerProps> = ({
  side,
  value,
  min,
  max,
  defaultValue,
  snapBelow,
  collapsed = false,
  onLive,
  onCommit,
  onSnap,
  controls,
  label,
  className,
  style,
}) => {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [atLimit, setAtLimit] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** The gesture in progress: where it started and what it has reached. */
  const gesture = useRef<{ startX: number; base: number; width: number; snapped: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const pendingX = useRef(0);
  /** The width reached by keys, committed on key up. */
  const keyWidth = useRef<number | null>(null);

  const direction = side === 'sidebar' ? 1 : -1;

  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);

      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }

      delete document.documentElement.dataset.resizing;
    },
    [],
  );

  /** One step of a gesture: a raw width → snap, clamp, live. */
  const reach = (rawWidth: number) => {
    const current = gesture.current;

    if (!current) {
      return;
    }

    const snapped = snapBelow !== undefined && rawWidth < snapBelow;

    if (snapped !== current.snapped) {
      current.snapped = snapped;
      onSnap?.(snapped);
    }

    setAtLimit(!snapped && (rawWidth < min || rawWidth > max));

    if (!snapped) {
      current.width = clamp(rawWidth, min, max);
      onLive(current.width);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { startX: event.clientX, base: value, width: value, snapped: collapsed };
    setDragging(true);
    // The whole page shows the resize cursor and selects no text while dragging.
    document.documentElement.dataset.resizing = '';
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture.current) {
      return;
    }

    pendingX.current = event.clientX;

    // At most once a frame: the width follows the pointer, the page does not re-render.
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;

        const current = gesture.current;

        if (current) {
          reach(current.base + (pendingX.current - current.startX) * direction);
        }
      });
    }
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;

    if (!current) {
      return;
    }

    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
      // The last position counts, even if its frame did not come.
      reach(current.base + (event.clientX - current.startX) * direction);
    }

    gesture.current = null;
    setDragging(false);
    setAtLimit(false);
    delete document.documentElement.dataset.resizing;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    onCommit(current.width);
  };

  const reset = () => {
    if (collapsed) {
      onSnap?.(false);
    }

    onLive(defaultValue);
    onCommit(defaultValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? raw['resize-step-big'] : raw['resize-step'];
    const from = keyWidth.current ?? value;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        next = collapsed && side === 'sidebar' ? min : from + step * direction;
        break;
      case 'ArrowLeft':
        next = from - step * direction;
        break;
      case 'Home':
        // The minimum, not a collapse (spec 07).
        next = min;
        break;
      case 'End':
        next = max;
        break;
      case 'Enter':
        event.preventDefault();
        reset();
        return;
      default:
        return;
    }

    event.preventDefault();

    // Narrower than the minimum by the keys collapses a region that can collapse.
    if (snapBelow !== undefined && next < min && !collapsed) {
      keyWidth.current = null;
      onSnap?.(true);
      onCommit(value);
      return;
    }

    // A collapsed region only opens: narrower than collapsed is nothing.
    if (collapsed && next < min) {
      return;
    }

    if (collapsed) {
      onSnap?.(false);
    }

    setAtLimit(next < min || next > max);
    keyWidth.current = clamp(next, min, max);
    onLive(keyWidth.current);
  };

  const handleKeyUp = () => {
    if (keyWidth.current !== null) {
      onCommit(keyWidth.current);
      keyWidth.current = null;
      setAtLimit(false);
    }
  };

  // The wheel over the border scrolls the region under it, instead of dying here.
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const target = document
      .elementsFromPoint?.(event.clientX - raw['resizer-hit'] * direction, event.clientY)
      .find((element) => element !== event.currentTarget);
    const scrollable = scrollableFrom(target ?? null);

    scrollable?.scrollBy({ top: event.deltaY, left: event.deltaX });
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={cx(styles.resizer, className)}
      style={style}
      data-side={side}
      data-hover={hover ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-limit={atLimit ? '' : undefined}
      onPointerEnter={() => {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHover(true), raw['resizer-delay']);
      }}
      onPointerLeave={() => {
        clearTimeout(hoverTimer.current);
        setHover(false);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={reset}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleKeyUp}
      onWheel={handleWheel}
    >
      <span className={styles.line} aria-hidden="true" />
    </div>
  );
};
