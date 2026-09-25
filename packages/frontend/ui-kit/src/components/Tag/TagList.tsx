import React from 'react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { tooltipProps } from '../Tooltip';
import { Tag, type TagTone } from './Tag';
import styles from './TagList.module.scss';

export interface TagListItem {
  id: string | number;
  label: string;
  tone?: TagTone;
  color?: string;
  dot?: boolean;
}

export interface TagListProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  tags: ReadonlyArray<TagListItem>;
  /** How many are shown before "+N". Default --tag-max-visible (3, spec 09 — a card). */
  max?: number;
  ref?: React.Ref<HTMLSpanElement>;
}

/**
 * Tags in a row, at most `max` of them; the rest collapse into "+N" whose
 * tooltip names them. The card never grows a second line of tags.
 */
export const TagList: React.FC<TagListProps> = ({ tags, max = raw['tag-max-visible'], className, ...props }) => {
  const visible = tags.slice(0, max);
  const hidden = tags.slice(max);

  return (
    <span {...props} className={cx(styles.list, className)}>
      {visible.map(({ id, label, ...tag }) => (
        <Tag key={id} {...tag}>
          {label}
        </Tag>
      ))}
      {hidden.length > 0 && (
        <Tag
          tone="neutral"
          // Focusable, so the hidden names (the tooltip, which then describes
          // it) are reachable from the keyboard too.
          tabIndex={0}
          {...tooltipProps({ text: hidden.map((tag) => tag.label).join(', ') })}
        >
          +{hidden.length}
        </Tag>
      )}
    </span>
  );
};
