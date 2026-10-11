import { Skeleton, cx } from '@task-manager-v2/ui-kit';
import styles from './NotificationRow.module.scss';

const RowSkeleton: React.FC<{ index: number }> = ({ index }) => (
  <div className={styles.row} data-skeleton="">
    <div className={styles.link}>
      <span className={styles.dot} />
      <span className={styles.avatar}>
        <Skeleton.Circle size="var(--avatar-sm)" />
      </span>
      <span className={styles.text}>
        {/* .title / .context already have the line-box height; the bar is centred in it */}
        <span className={cx(styles.title, styles.slot)}>
          <Skeleton.Line index={index} />
        </span>
        <span className={cx(styles.context, styles.slot)}>
          <Skeleton.Line index={index + 3} />
        </span>
      </span>
    </div>
  </div>
);

export const NotificationRowSkeleton: React.FC<{ rows: number }> = ({
  rows,
}) => (
  <Skeleton label="Loading notifications">
    {Array.from({ length: rows }, (_, index) => (
      <RowSkeleton key={index} index={index} />
    ))}
  </Skeleton>
);
