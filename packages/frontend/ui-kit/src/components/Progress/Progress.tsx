import React from 'react';
import styles from './Progress.module.scss';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  /** 0..1. Absent — indeterminate (unknown duration). Out-of-range values are clamped. */
  value?: number;
  /** Hold off drawing for this long after mount, so fast operations never flash. 0 — show at once. */
  delay?: number;
  ref?: React.Ref<HTMLDivElement>;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const Progress: React.FC<ProgressProps> = ({
  value,
  className,
  label = 'Loading',
  delay = raw['spinner-delay'],
  style,
  ...props
}) => {
  const delayed = useDelayedFlag(true, { delay, minVisible: 0 });
  const visible = delay <= 0 || delayed;

  const determinate = value !== undefined;
  const ratio = determinate ? clamp(value) : 0;

  return (
    <div
      role="progressbar"
      className={cx(styles.root, !visible && styles.pending, className)}

      data-indeterminate={!determinate}

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
