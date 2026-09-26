import React from 'react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { useMessages } from '../../messages';
import styles from './Skeleton.module.scss';

type Length = number | string;

const toLength = (value: Length | undefined) => (typeof value === 'number' ? `${value}px` : value);

/** Line widths by index: different, so the frame looks like text, and fixed, so it never jumps on a re-render. */
const LINE_WIDTHS = ['80%', '60%', '70%', '55%', '75%', '50%', '85%', '65%'];

export const skeletonWidth = (index: number) => LINE_WIDTHS[Math.abs(Math.trunc(index)) % LINE_WIDTHS.length];

interface ShapeProps {
  /** On a sunken surface (the sidebar, a board column) the shape is a step darker. */
  sunken?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export interface SkeletonLineProps extends ShapeProps {
  /** Its width; or `index` — a width of its own, the same on every render. Default: full. */
  width?: Length;
  index?: number;
}

export interface SkeletonBlockProps extends ShapeProps {
  width?: Length;
  height: Length;
  children?: React.ReactNode;
}

export interface SkeletonCircleProps extends ShapeProps {
  size: Length;
}

const Line: React.FC<SkeletonLineProps> = ({ width, index, sunken, className, style }) => (
  <span
    className={cx(styles.shape, styles.line, className)}
    data-sunken={sunken || undefined}
    style={{ width: toLength(width) ?? (index === undefined ? undefined : skeletonWidth(index)), ...style }}
  />
);

/** A block; with children — a card-like frame for lines inside it, which sit on its own surface. */
const Block: React.FC<SkeletonBlockProps> = ({ width, height, sunken, className, style, children }) => (
  <span
    className={cx(styles.shape, styles.block, children != null && styles.frame, className)}
    data-sunken={sunken || undefined}
    style={{ width: toLength(width), height: toLength(height), ...style }}
  >
    {children}
  </span>
);

const Circle: React.FC<SkeletonCircleProps> = ({ size, sunken, className, style }) => (
  <span
    className={cx(styles.shape, styles.circle, className)}
    data-sunken={sunken || undefined}
    style={{ width: toLength(size), height: toLength(size), ...style }}
  />
);

export interface SkeletonProps {
  /** What is loading, for a screen reader: 'Loading board'. Default: the kit's `loading`. */
  label?: string;
  /** Show at once, without the 200 ms wait (a story, a test). */
  immediate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** The frame of the real structure: the same sizes the data will have. */
  children: React.ReactNode;
}

const SkeletonRoot: React.FC<SkeletonProps> = ({ label, immediate = false, className, style, children }) => {
  const messages = useMessages();
  const delayed = useDelayedFlag(true, { delay: raw['spinner-delay'], minVisible: 0 });
  const shown = immediate || delayed;

  return (
    <div className={cx(styles.root, className)} style={style} aria-busy="true" data-shown={shown || undefined}>
      <span className={styles.srOnly}>{label ?? messages.loading}</span>
      {/* Laid out from the start, drawn after the delay: nothing shifts when it appears. */}
      <div className={styles.frameSet} aria-hidden="true">
        {children}
      </div>
    </div>
  );
};

/**
 * The frame of a surface while its data is not there yet (spec: States · 01).
 * It repeats the real structure — board columns, table rows, panel
 * properties — in the sizes the data will have, so nothing moves when the
 * data comes. Appears after 200 ms (faster data never shows it), pulses once
 * and holds still. A screen reader hears one name; the shapes are hidden.
 *
 * Compositions live beside their components: `TaskCard.Skeleton`.
 */
export const Skeleton = Object.assign(SkeletonRoot, { Line, Block, Circle });
