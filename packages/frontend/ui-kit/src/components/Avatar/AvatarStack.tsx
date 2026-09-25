import React from 'react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { tooltipProps } from '../Tooltip';
import { useMessages } from '../../messages';
import { Avatar, type AvatarSize } from './Avatar';
import styles from './AvatarStack.module.scss';

export interface AvatarStackPerson {
  id: string | number;
  name: string;
  src?: string;
}

export interface AvatarStackProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  people: ReadonlyArray<AvatarStackPerson>;
  size?: AvatarSize;
  /** At most this many faces, then a counter. Default --avatar-stack-max (3, spec 08). */
  max?: number;
  ref?: React.Ref<HTMLSpanElement>;
}

/**
 * Overlapping avatars (spec 08): who watches a task, who is on a board. Each
 * face is cut out of the previous one by a ring of the surface color — not
 * white, so it holds on a dark surface too.
 */
export const AvatarStack: React.FC<AvatarStackProps> = ({
  people,
  size = 'sm',
  max = raw['avatar-stack-max'],
  className,
  ...props
}) => {
  const messages = useMessages();
  const shown = people.slice(0, max);
  const hidden = people.slice(max);

  return (
    <span {...props} role="group" className={cx(styles.stack, className)}>
      {shown.map((person) => (
        <Avatar
          key={person.id}
          className={styles.face}
          size={size}
          name={person.name}
          id={person.id}
          src={person.src}
          {...tooltipProps({ text: person.name })}
        />
      ))}
      {hidden.length > 0 && (
        <span
          role="img"
          tabIndex={0}
          aria-label={messages.more(hidden.length)}
          className={cx(styles.face, styles.counter, styles[size])}
          {...tooltipProps({ text: hidden.map((person) => person.name).join(', ') })}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
};
