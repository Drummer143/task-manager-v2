import React from 'react';
import {
  IconButton,
  LinkBase,
  raw,
  tooltipProps,
  useDelayedFlag,
} from '@task-manager-v2/ui-kit';
import { formatNotificationTime, useMinuteClock } from './time';
import styles from './NotificationRow.module.scss';

export interface NotificationAction {
  icon: React.ReactNode;
  /** The button's name and its tooltip at once ('Mark as read'). */
  label: string;
  /** Shown in the tooltip; the list binds the key itself ('u'). */
  keys?: string;
  onClick(): void;
}

export interface NotificationRowProps {
  /** For the list's aria-activedescendant: the row under the cursor is named by its id. */
  id: string;
  /**
   * Opens it in the panel: /{ws}/inbox?view=unread&task=TM-248. Always replace — history does not
   * pile up. None for a notification with nothing to open: the row is not a link then.
   */
  href?: string;
  /** updated_at: the last event in the notification. */
  time: Date;
  unread: boolean;
  /** Line 1: who did what ('Mira Sato mentioned you'). */
  title: React.ReactNode;
  /** The last actor's Avatar, or a system mark. */
  avatar: React.ReactNode;
  /** Line 2: where ('TM-248 “Can we reuse…”'). */
  context: React.ReactNode;
  /** On hover and on the cursor, in place of the time. */
  actions: NotificationAction[];

  /** Its object was deleted. */
  gone?: boolean;
  /** Events folded into it; a pill when > 1. */
  count?: number;
  /**
   * The row's place in the whole list (1-based): only some rows are in the DOM, so a reader
   * learns "row 37" from this, not from counting.
   */
  rowIndex?: number;
  /** The list's cursor is here (spec 02): a bar on the left. Not DOM focus. */
  cursor?: boolean;
  /** Its object is in the panel now. */
  opened?: boolean;
  /** A change of it is on its way; it dims only if that takes a while. */
  pending?: boolean;
}

/** The whole row as a link, or the same box without one when there is nothing to open. */
const RowBody: React.FC<{ href?: string; children: React.ReactNode }> = ({
  href,
  children,
}) =>
  href === undefined ? (
    <div className={styles.link}>{children}</div>
  ) : (
    <LinkBase href={href} replace tabIndex={-1} className={styles.link}>
      {children}
    </LinkBase>
  );

/**
 * One row of Inbox (spec: Inbox · 02): an unread dot, who, what and where on
 * two lines, the time. The whole row is a link that opens it in the panel; the
 * action buttons lie over its right end, beside the link and not inside it.
 *
 * A row of the list's grid: the list keeps DOM focus on itself and points at
 * the cursor's row with aria-activedescendant (spec 08), so nothing in the row
 * is a Tab stop or takes focus from a click.
 */
export const NotificationRow: React.FC<NotificationRowProps> = ({
  id,
  href,
  unread,
  avatar,
  title,
  context,
  time,
  count = 1,
  rowIndex,
  cursor,
  opened,
  pending = false,
  gone,
  actions,
}) => {
  const now = useMinuteClock();
  const when = formatNotificationTime(time, now);

  const dimmed = useDelayedFlag(pending, {
    delay: raw['inbox-pending-delay'],
    minVisible: 0,
  });
  const folded = count > 1;

  return (
    <div
      id={id}
      role="row"
      aria-rowindex={rowIndex}
      className={styles.row}
      // How many actions stand at the right: the time's column keeps room for them
      style={{ '--_actions': actions.length } as React.CSSProperties}

      data-unread={unread ? '' : undefined}
      data-cursor={cursor ? '' : undefined}
      data-opened={opened ? '' : undefined}
      data-gone={gone ? '' : undefined}
      data-pending={dimmed ? '' : undefined}

      aria-current={opened ? 'true' : undefined}

      onMouseDown={(event) => event.preventDefault()}
    >
      <div role="gridcell" className={styles.cell}>
        <RowBody href={href}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.avatar}>{avatar}</span>
          <span className={styles.text}>
            {unread && <span className={styles.srOnly}>Unread. </span>}

            <span className={styles.title}>{title}</span>
            <span className={styles.srOnly}> </span>
            <span className={styles.context}>{context}</span>

            <span className={styles.srOnly}>
              {folded ? `, ${count} updates` : ''}, {when.spoken}
            </span>
          </span>
          <span className={styles.meta} aria-hidden="true">
            {folded && <span className={styles.count}>{count}</span>}

            <time
              className={styles.time}
              dateTime={time.toISOString()}
              {...tooltipProps({ text: when.full })}
            >
              {when.short}
            </time>
          </span>
        </RowBody>

        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action) => (
              <IconButton
                key={action.label}
                className={styles.action}
                size="sm"
                icon={action.icon}
                label={action.label}
                keys={action.keys}
                tabIndex={-1}
                onClick={action.onClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationRow;
