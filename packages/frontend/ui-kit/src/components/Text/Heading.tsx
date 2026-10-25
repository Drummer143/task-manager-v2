import React from 'react';
import { textAttributes, type TextSize, type TextStyleProps } from './Text';

/** A heading's level: its tag and its step together. `display` is a page's one title, an `h1`. */
export type HeadingLevel = 'display' | 1 | 2 | 3;

export interface HeadingProps
  extends TextStyleProps, Omit<React.HTMLAttributes<HTMLHeadingElement>, 'color'> {
  level: HeadingLevel;
  children: React.ReactNode;
  ref?: React.Ref<HTMLHeadingElement>;
}

const TAG: Record<HeadingLevel, 'h1' | 'h2' | 'h3'> = { display: 'h1', 1: 'h1', 2: 'h2', 3: 'h3' };
const SIZE: Record<HeadingLevel, TextSize> = { display: 'display', 1: 'h1', 2: 'h2', 3: 'h3' };

/**
 * A heading whose level is its size (Typography 08): `level={2}` is both `<h2>` and the h2 step.
 * Another size for a level does not exist — pick the level the outline needs, the size follows.
 */
export const Heading: React.FC<HeadingProps> = ({
  level,
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
  const Tag = TAG[level];

  return (
    <Tag {...props} {...textAttributes(SIZE[level], { tone, weight, numeric, mono, truncate }, className, style)}>
      {children}
    </Tag>
  );
};
