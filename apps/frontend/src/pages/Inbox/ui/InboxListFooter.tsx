import React from 'react';
import { Button } from '@task-manager-v2/ui-kit';
import styles from '../Inbox.module.scss';

export interface InboxListFooterProps {
  /** The next page is on its way. */
  loading: boolean;
  /** The next page failed: the list stays, the footer offers to try again (spec 06). */
  failed: boolean;
  /** Its place among the grid's rows, 1-based: right after the last loaded row. */
  rowIndex: number;

  onRetry(): void;
}

/**
 * The row after the loaded ones, inside the grid, so it is a row with one cell: a grid holds
 * rows only. Rendered only while there is something to say, so a screen reader never hears a
 * load that is not happening.
 */
export const InboxListFooter: React.FC<InboxListFooterProps> = ({ loading, failed, rowIndex, onRetry }) => {
  if (!loading && !failed) {
    return null;
  }

  return (
    <div role="row" aria-rowindex={rowIndex} className={styles.footer}>
      <div role="gridcell" aria-busy={loading || undefined} className={styles.footerCell}>
        {failed ? (
          <>
            Couldn’t load more
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </>
        ) : (
          'Loading…'
        )}
      </div>
    </div>
  );
};
