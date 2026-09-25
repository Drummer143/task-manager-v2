import React from 'react';
import { FieldInput, type FieldInputProps } from './FieldInput';
import { InlineInput, type InlineInputProps } from './InlineInput';

/**
 * Two modes of one component (spec 04): `field` — an ordinary field with a
 * visible border; `inline` — in-place editing that looks like text until it is
 * worked with. The props of each mode are its own.
 */
export type InputProps = ({ mode?: 'field' } & FieldInputProps) | ({ mode: 'inline' } & InlineInputProps);

export const Input: React.FC<InputProps> = (props) => {
  if (props.mode === 'inline') {
    const { mode, ...inline } = props;
    void mode;

    return <InlineInput {...inline} />;
  }

  const { mode, ...field } = props;
  void mode;

  return <FieldInput {...field} />;
};
