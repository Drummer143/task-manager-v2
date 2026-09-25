import React, { useId } from 'react';
import { cx } from '../../utils';
import { XIcon } from '../../icons';
import { useMessages } from '../../messages';
import styles from './Tag.module.scss';

export type TagTone = 'neutral' | 'accent' | 'outline' | 'danger';

interface TagOwnProps {
  /** neutral — labels by default; accent — a highlighted one; outline — a status; danger — "Overdue". */
  tone?: TagTone;
  /**
   * A color from data — a user label or a board status. It is never used as
   * is: tint() keeps its hue and takes the lightness of the kit's ramp for
   * the current surface. Without `dot` it colors the whole tag.
   */
  color?: string;
  /** A status: an outline tag with a dot of `color` and the name — color is never alone (spec 08). */
  dot?: boolean;
  /** A removable tag: × inside. */
  onRemove?(): void;
  children: React.ReactNode;
}

type SpanProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color' | 'children'> & {
  onClick?: undefined;
  ref?: React.Ref<HTMLSpanElement>;
};

/** A clickable tag is a button — hover and press like a ghost button. Not removable at the same time. */
type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children' | 'type'> & {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onRemove?: undefined;
  ref?: React.Ref<HTMLButtonElement>;
};

export type TagProps = TagOwnProps & (SpanProps | ButtonProps);

/** The custom property tint() reads; set on the tag, so each tag has its own color. */
const colorStyle = (color: string | undefined, style: React.CSSProperties | undefined) =>
  color ? ({ ...style, '--tag-color': color } as React.CSSProperties) : style;

/** A small carrier of meaning (spec 08): a label, a status, a flag. */
export const Tag: React.FC<TagProps> = ({ tone = 'neutral', color, dot = false, onRemove, children, className, style, ...props }) => {
  const textId = useId();
  const messages = useMessages();
  const colored = color !== undefined && !dot;

  const content = (
    <>
      {dot && color && <span className={styles.dot} aria-hidden="true" />}
      <span id={onRemove ? textId : undefined} className={styles.text}>
        {children}
      </span>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={messages.removeTag}
          aria-describedby={textId}
          onClick={onRemove}
        >
          <XIcon />
        </button>
      )}
    </>
  );

  const common = {
    className: cx(styles.tag, styles[dot ? 'outline' : tone], colored && styles.colored, className),
    style: colorStyle(color, style),
  };

  if (props.onClick) {
    const buttonProps = props as ButtonProps;

    return (
      <button {...buttonProps} {...common} className={cx(common.className, styles.clickable)} type="button">
        {content}
      </button>
    );
  }

  return (
    <span {...(props as SpanProps)} {...common}>
      {content}
    </span>
  );
};
