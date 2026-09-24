import React from 'react';
import styles from './Spinner.module.scss';
import { cx } from '../../utils/cx';
import { raw } from '../../tokens';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'accent' | 'neutral' | 'danger';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  ref?: React.Ref<HTMLSpanElement>;
  size?: SpinnerSize;
  label?: string;
  variant?: SpinnerVariant;
  className?: string;
}

/**
 * Geometry in screen pixels: the viewBox equals the rendered size, so the
 * stroke is exactly the token value at every size (no vector-effect — it would
 * also put the dash pattern in screen space and draw extra arcs on big rings).
 */
const GEOMETRY: Record<SpinnerSize, { box: number; stroke: number }> = {
  xs: { box: raw['spinner-size-xs'], stroke: raw['spinner-stroke-thin'] },
  sm: { box: raw['spinner-size-sm'], stroke: raw['spinner-stroke-thick'] },
  md: { box: raw['spinner-size-md'], stroke: raw['spinner-stroke-thick'] },
  lg: { box: raw['spinner-size-lg'], stroke: raw['spinner-stroke-thick'] },
};

const Spinner: React.FC<SpinnerProps> = ({
  size = 'sm',
  label = 'Loading',
  variant = 'neutral',
  className,
  ...props
}) => {
  const { box, stroke } = GEOMETRY[size];
  const center = box / 2;
  const radius = (box - stroke) / 2;

  return (
    <span
      role="status"

      aria-label={label}

      className={cx(
        styles.root,
        styles[variant],
        styles[size],
        className,
      )}

      {...props}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${box} ${box}`}>
        <circle className={styles.track} cx={center} cy={center} r={radius} strokeWidth={stroke} />
        <circle
          className={styles.arc}
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          pathLength={100}
        />
      </svg>
    </span>
  );
};

export default Spinner;
