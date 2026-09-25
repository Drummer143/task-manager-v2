import React, { useId, useRef } from 'react';
import { cx, composeRefs } from '../../utils';
import { raw } from '../../tokens';
import { tooltipProps } from '../Tooltip';
import { useAutoGrow } from './useAutoGrow';
import { useFieldError } from './useFieldError';
import styles from './Input.module.scss';

type NativeTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'children'
>;

export interface TextareaProps extends NativeTextareaProps {
  value: string;
  onValueChange(value: string): void;
  /** ⌘Enter / Ctrl+Enter or blur. A plain Enter is a new line. */
  onCommit?(value: string): void;
  error?: string;
  selectOnFocus?: boolean;
  disabledReason?: string;
  /** Grow with the text up to --textarea-max-rows, then scroll. Default true. */
  autoGrow?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

/** The multi-line field: the same frame, tokens and error rules as Input. */
export const Textarea: React.FC<TextareaProps> = ({
  value,
  onValueChange,
  onCommit,
  error,
  selectOnFocus = false,
  disabled = false,
  disabledReason,
  readOnly,
  autoGrow = true,
  rows = 1,
  className,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  ref,
  ...props
}) => {
  const errorId = useId();
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const field = useFieldError(error);
  const shownError = field.shownError;
  const reason = disabled && disabledReason ? disabledReason : undefined;

  useAutoGrow(innerRef, value, { enabled: autoGrow, maxRows: raw['textarea-max-rows'] });

  return (
    <div className={cx(styles.fieldRoot, className)}>
      <div
        className={cx(styles.field, styles.multiline)}
        data-invalid={shownError ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        {...(reason ? tooltipProps({ reason }) : undefined)}
      >
        <textarea
          {...props}
          ref={composeRefs(innerRef, ref)}
          rows={rows}
          className={styles.input}
          value={value}
          readOnly={readOnly || disabled}
          aria-disabled={disabled || undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={cx(props['aria-describedby'], shownError && errorId) || undefined}
          onChange={(event) => {
            onChange?.(event);

            if (!disabled) {
              onValueChange(event.target.value);
            }
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);

            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.defaultPrevented) {
              event.preventDefault();
              onCommit?.(event.currentTarget.value);
            }
          }}
          onFocus={(event) => {
            field.onFocus();
            onFocus?.(event);

            if (selectOnFocus) {
              event.currentTarget.select();
            }
          }}
          onBlur={(event) => {
            field.onBlur();
            onBlur?.(event);

            if (!disabled) {
              onCommit?.(event.currentTarget.value);
            }
          }}
        />
      </div>

      {shownError && (
        <div id={errorId} className={styles.error}>
          {shownError}
        </div>
      )}
    </div>
  );
};
