import React, { useState } from 'react';
import styles from './Progress.module.scss';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

/**
 * Every bar needs a name, but it may come from visible text nearby — so the
 * name is either `label` or `aria-labelledby`, never neither and never both.
 */
type ProgressName =
  | { label: string; 'aria-labelledby'?: never }
  | { label?: never; 'aria-labelledby': string };

export type ProgressProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'aria-label' | 'aria-labelledby'
> & {
  /** 0..1. Absent or not a finite number — indeterminate (unknown duration). Out-of-range values are clamped. */
  value?: number;
  /** Hold off drawing for this long after mount, so fast operations never flash. 0 — show at once. */
  delay?: number;
  ref?: React.Ref<HTMLDivElement>;
} & ProgressName;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const Progress: React.FC<ProgressProps> = ({
  value,
  className,
  label,
  delay = raw['spinner-delay'],
  style,
  ...props
}) => {
  const delayed = useDelayedFlag(true, { delay, minVisible: 0 });
  const visible = delay <= 0 || delayed;

  const determinate = value !== undefined && Number.isFinite(value);
  const ratio = determinate ? clamp(value) : 0;

  // A rollback jumps instead of sliding back, so progress never seems to
  // "drive away" (spec: determinate · decrease). State adjusted during render.
  const [previous, setPrevious] = useState(ratio);
  const [shrinking, setShrinking] = useState(false);

  if (ratio !== previous) {
    setShrinking(determinate && ratio < previous);
    setPrevious(ratio);
  }

  return (
    <div
      role="progressbar"
      className={cx(styles.root, !visible && styles.pending, className)}

      data-indeterminate={!determinate}
      data-shrinking={shrinking || undefined}

      aria-label={label}
      aria-hidden={visible ? undefined : true}
      {...(determinate
        ? {
            'aria-valuenow': Math.round(ratio * 100),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
          }
        : {})}

      style={
        determinate
          ? ({ ...style, '--progress-value': ratio } as React.CSSProperties)
          : style
      }

      {...props}
    >
      <div aria-hidden="true" className={styles.thumb} />
    </div>
  );
};

export default Progress;
