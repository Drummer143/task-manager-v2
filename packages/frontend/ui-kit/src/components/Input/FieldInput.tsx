import React, { useId } from 'react';
import { cx } from '../../utils';
import { Kbd } from '../Kbd';
import { tooltipProps } from '../Tooltip';
import { useFieldError } from './useFieldError';
import styles from './Input.module.scss';

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'size' | 'children'
>;

export interface FieldInputProps extends NativeInputProps {
  /** Controlled (spec 00): the value comes in, every change goes out. */
  value: string;
  onValueChange(value: string): void;
  /** Enter or blur: the value is final. */
  onCommit?(value: string): void;
  /** Decorative, before the text: a magnifier in a filter. */
  icon?: React.ReactNode;
  /** Hotkey hint at the right edge, e.g. `'/'`. The app binds the hotkey itself. */
  keys?: string;
  /** Shown under the field — on blur, not mid-typing (see useFieldError). */
  error?: string;
  /** Select the whole value on focus: a filter, an id. */
  selectOnFocus?: boolean;
  /** Why the field is disabled: shown in a tooltip, readable from the keyboard. */
  disabledReason?: string;
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * The ordinary field: the border is always visible. The native input carries
 * every DOM prop and the ref; `className` goes on the frame around it, which
 * also holds the icon and the hotkey.
 */
export const FieldInput: React.FC<FieldInputProps> = ({
  value,
  onValueChange,
  onCommit,
  icon,
  keys,
  error,
  selectOnFocus = false,
  disabled = false,
  disabledReason,
  readOnly,
  className,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}) => {
  const errorId = useId();
  const field = useFieldError(error);
  const shownError = field.shownError;
  const reason = disabled && disabledReason ? disabledReason : undefined;

  return (
    <div className={cx(styles.fieldRoot, className)}>
      <div
        className={styles.field}
        data-invalid={shownError ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        {...(reason ? tooltipProps({ reason }) : undefined)}
      >
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}

        <input
          {...props}
          className={styles.input}
          value={value}
          // Disabled the kit way (spec 10): focusable and hoverable, so the
          // reason is reachable, but not editable.
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

            // Not while an IME is composing: that Enter picks a candidate.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
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

        {keys && <Kbd className={styles.keys} keys={keys} variant="inline" />}
      </div>

      {shownError && (
        <div id={errorId} className={styles.error}>
          {shownError}
        </div>
      )}
    </div>
  );
};
