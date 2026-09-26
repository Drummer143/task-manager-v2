import React from 'react';
import { RowButton, StateLayout, type StateAction, type StateScale } from './StateLayout';

export interface EmptyStateProps {
  /** Default `area`. */
  scale?: StateScale;
  /** Why it is empty: 'This board has no tasks yet', 'No tasks match “Assignee: me”'. */
  title: string;
  /** One sentence more — how many the filter hides, a hotkey for a newcomer. */
  description?: string;
  /** The next step, the main one; with its hotkey. */
  action?: StateAction;
  secondary?: StateAction;
  className?: string;
}

/**
 * Explains an emptiness and offers the next step (spec: States · 02). No
 * pictures, no emoji: a title, one sentence, at most two actions. What kind
 * of empty it is — nothing yet, hidden by a filter, no search results, all
 * done — lives in its words: the screen writes them, and a filtered empty
 * never reads like a true one. Inside columns, cells and lists it is a
 * line (`scale="row"`), and a row with one action is itself the button.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ scale = 'area', title, description, action, secondary, className }) => {
  if (scale === 'row' && action && !secondary && !description) {
    return <RowButton title={title} action={action} className={className} />;
  }

  return (
    <StateLayout
      scale={scale}
      tone="neutral"
      title={title}
      description={description}
      actions={[action, secondary]}
      className={className}
    />
  );
};
