import React from 'react';
import { cx } from '../../utils';
import { Button } from '../Button';
import { Kbd } from '../Kbd';
import styles from './States.module.scss';

/** One next step of an empty or error state. */
export interface StateAction {
  label: string;
  onAction(): void;
  /** Its hotkey, shown on it (the app binds it). */
  keys?: string;
}

/**
 * Where the state stands (spec: States · 04):
 * - `area` — the canvas, a whole panel, a page: a block in the middle, 1–2 buttons;
 * - `block` — a panel section, a table group: one line on a backing, link actions;
 * - `row` — a column, a cell, an attachment, a list item: a line the height of an item.
 */
export type StateScale = 'area' | 'block' | 'row';

interface StateLayoutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  scale: StateScale;
  tone: 'neutral' | 'danger';
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The main step first; at most two. */
  actions: (StateAction | undefined)[];
}

const LinkAction: React.FC<{ action: StateAction }> = ({ action }) => (
  <button type="button" className={styles.link} onClick={action.onAction}>
    {action.label}
    {action.keys && <Kbd keys={action.keys} />}
  </button>
);

/** The layout EmptyState and ErrorState share: the same three scales, a tone apart. */
export const StateLayout: React.FC<StateLayoutProps> = ({ scale, tone, title, description, actions, className, ...rest }) => {
  const steps = actions.filter((action): action is StateAction => action !== undefined);

  if (scale === 'area') {
    return (
      <div {...rest} className={cx(styles.state, styles.area, className)} data-tone={tone}>
        <p className={styles.title}>{title}</p>
        {description != null && <p className={styles.description}>{description}</p>}
        {steps.length > 0 && (
          <div className={styles.actions}>
            {steps.map((action, index) => (
              <Button key={action.label} variant={index === 0 ? 'primary' : 'secondary'} keys={action.keys} onClick={action.onAction}>
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div {...rest} className={cx(styles.state, styles[scale], className)} data-tone={tone}>
      <span className={styles.line}>
        <span className={styles.title}>{title}</span>
        {description != null && <span className={styles.description}>{description}</span>}
      </span>
      {steps.map((action) => (
        <React.Fragment key={action.label}>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <LinkAction action={action} />
        </React.Fragment>
      ))}
    </div>
  );
};

/** An empty row with one step is itself the button: the whole line is the hit zone. */
export const RowButton: React.FC<{ title: React.ReactNode; action: StateAction; className?: string }> = ({
  title,
  action,
  className,
}) => (
  <button type="button" className={cx(styles.state, styles.row, styles.rowButton, className)} data-tone="neutral" onClick={action.onAction}>
    <span className={styles.title}>{title}</span>
    <span className={styles.dot} aria-hidden="true">
      ·
    </span>
    <span className={styles.rowAction}>
      {action.label}
      {action.keys && <Kbd keys={action.keys} />}
    </span>
  </button>
);
