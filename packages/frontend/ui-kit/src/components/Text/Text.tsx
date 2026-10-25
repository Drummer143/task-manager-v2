import React from 'react';
import { cx } from '../../utils';
import { tooltipProps } from '../Tooltip';
import styles from './Text.module.scss';

/** A step of the scale (spec: [UI-kit] Типографика · 02). There are no sizes between them. */
export type TextSize = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'meta';
/** A role of text color (Typography 04): it follows the surface, a shade would not. */
export type TextTone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger';
export type TextWeight = 'normal' | 'strong';

export interface TextStyleProps {
  /**
   * Left out: the color around it — an error banner's, a primary button's, an inverse surface's.
   * Plain text is primary all the same: the app's root sets `--text-primary` (Typography 08).
   */
  tone?: TextTone;
  /** The step's own weight by default: 600 for headings, 400 for body and meta. */
  weight?: TextWeight;
  /** Tabular digits: counters, dates, columns — anything that changes in place or aligns. */
  numeric?: boolean;
  /** Identifiers, keys, code — never ordinary text for a "technical" look. */
  mono?: boolean;
  /**
   * `true` — one line with an ellipsis; a number — that many lines. When the text is actually cut,
   * a tooltip shows it whole (Typography 06): never use it for messages, they wrap.
   */
  truncate?: true | number;
}

export interface TextProps
  extends TextStyleProps, Omit<React.HTMLAttributes<HTMLElement>, 'color'> {
  /** Default `span`. */
  as?: 'span' | 'p' | 'div' | 'label';
  /** Default `body`. */
  size?: TextSize;
  /** With `as="label"`. */
  htmlFor?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

type ClampStyle = React.CSSProperties & { '--_lines'?: number };

/** The classes, style and tooltip of a text of `size`: shared by Text and Heading. */
export const textAttributes = (
  size: TextSize,
  { tone, weight, numeric, mono, truncate }: TextStyleProps,
  className?: string,
  style?: React.CSSProperties,
) => {
  const lines = truncate === true ? 1 : truncate;
  const clamped = lines !== undefined && lines > 1;

  return {
    className: cx(
      styles.text,
      styles[size],
      weight && styles[weight],
      tone && styles[tone],
      numeric && styles.numeric,
      mono && styles.mono,
      lines === 1 && styles.truncate,
      clamped && styles.clamp,
      className,
    ),
    style: clamped ? ({ ...style, '--_lines': lines } as ClampStyle) : style,
    // Only when the text is actually cut does the tooltip show: the host measures it on hover
    ...(lines === undefined ? {} : tooltipProps({ overflow: true })),
  };
};

/**
 * Text on the scale (Typography 08). Sizes come only from `size`: kit components never take a
 * font size. In module CSS, the same steps are `@include typography.type(step)`.
 */
export const Text: React.FC<TextProps> = ({
  as = 'span',
  size = 'body',
  tone,
  weight,
  numeric,
  mono,
  truncate,
  className,
  style,
  children,
  ...props
}) => {
  // One of four plain elements: their props are the same HTMLElement attributes
  const Tag = as as React.ElementType;

  return (
    <Tag {...props} {...textAttributes(size, { tone, weight, numeric, mono, truncate }, className, style)}>
      {children}
    </Tag>
  );
};
