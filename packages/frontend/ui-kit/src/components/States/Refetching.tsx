import React from 'react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { useMessages } from '../../messages';
import { Progress } from '../Progress';
import styles from './Refetching.module.scss';

export interface RefetchingProps {
  /** A load is running over data that is already shown. */
  active: boolean;
  /** The bar's name. Default: the kit's `refetching` ('Updating'). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  /** The data: it stays in place and stays workable. */
  children: React.ReactNode;
}

/**
 * Refetching over data (spec: States · 00, "Refetching"): the data does not
 * change its look — a thin bar runs along the top of the area (after the
 * usual 200 ms), and only a load longer than a second dims the data a
 * little. Wrap the area under its header in it.
 */
export const Refetching: React.FC<RefetchingProps> = ({ active, label, className, style, children }) => {
  const messages = useMessages();
  const dim = useDelayedFlag(active, { delay: raw['refetch-dim-after'], minVisible: 0 });

  return (
    <div className={cx(styles.root, className)} style={style} aria-busy={active || undefined}>
      {active && <Progress className={styles.bar} label={label ?? messages.refetching} />}
      <div className={styles.content} data-dim={(active && dim) || undefined}>
        {children}
      </div>
    </div>
  );
};
