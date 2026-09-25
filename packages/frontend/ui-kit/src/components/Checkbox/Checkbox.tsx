import React, { useId, useLayoutEffect, useRef } from 'react';
import { cx, composeRefs } from '../../utils';
import { CheckIcon, MinusIcon } from '../../icons';
import { tooltipProps } from '../Tooltip';
import styles from './Checkbox.module.scss';

export type CheckboxChecked = boolean | 'mixed';

type NativeCheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'defaultChecked' | 'onChange' | 'value' | 'children' | 'aria-label' | 'aria-labelledby'
>;

/** A visible label, or — without one (a table row) — an accessible name. */
type CheckboxName =
  | { label: React.ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label': string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label'?: string; 'aria-labelledby': string };

export type CheckboxProps = NativeCheckboxProps &
  CheckboxName & {
    /** Controlled (spec 00). `mixed` — only for "select all" of a table or a group. */
    checked: CheckboxChecked;
    /** From `mixed` a click checks all (spec 05). `shiftKey` — for a range of table rows. */
    onCheckedChange(checked: boolean, event: { shiftKey: boolean }): void;
    /** A second, muted line under the label. */
    description?: React.ReactNode;
    /** Only in a form, after a submit attempt — with its text under the label. */
    error?: string;
    /** Why it is disabled: shown in a tooltip, readable from the keyboard. */
    disabledReason?: string;
    ref?: React.Ref<HTMLInputElement>;
  };

/**
 * A native `<input type="checkbox">` with the kit's own drawing (spec 00, 05):
 * an accent outline and a dark mark on a light base, never a filled square.
 * The whole row with the label is the hit zone. `className` goes on the row,
 * the ref and other DOM props on the input.
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  error,
  disabled = false,
  disabledReason,
  className,
  onClick,
  ref,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shiftKey = useRef(false);
  const descriptionId = useId();
  const errorId = useId();
  const mixed = checked === 'mixed';
  const reason = disabled && disabledReason ? disabledReason : undefined;

  // `indeterminate` exists only as a DOM property; it is what readers hear as "mixed".
  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = mixed;
    }
  }, [mixed]);

  return (
    <label
      className={cx(styles.root, label === undefined && styles.bare, className)}
      data-checked={mixed ? 'mixed' : checked ? 'true' : 'false'}
      data-invalid={error ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      {...(reason ? tooltipProps({ reason }) : undefined)}
    >
      <span className={styles.box}>
        <input
          {...props}
          ref={composeRefs(inputRef, ref)}
          type="checkbox"
          className={styles.input}
          checked={checked === true}
          // Disabled the kit way (spec 10): focusable for its reason, but inert.
          aria-disabled={disabled || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cx(props['aria-describedby'], description !== undefined && descriptionId, error && errorId) || undefined
          }
          onClick={(event) => {
            onClick?.(event);

            // No preventDefault when disabled: on a controlled checkbox it fights
            // React's own restore and leaves the box flipped. Ignoring the change
            // below is enough — React puts `checked` back.
            shiftKey.current = event.shiftKey;
          }}
          onChange={(event) => {
            // The click has already cleared `indeterminate`; React restores
            // `checked`, not this. Put it back — if the owner moves on from
            // mixed, the effect above clears it again.
            event.currentTarget.indeterminate = mixed;

            if (!disabled) {
              // From mixed this is `true`: a click checks all (spec 05).
              onCheckedChange(checked !== true, { shiftKey: shiftKey.current });
            }
          }}
        />
        <span className={styles.mark} aria-hidden="true">
          {mixed ? <MinusIcon /> : checked ? <CheckIcon /> : null}
        </span>
      </span>

      {(label !== undefined || description !== undefined || error) && (
        <span className={styles.text}>
          {label !== undefined && <span className={styles.label}>{label}</span>}
          {description !== undefined && (
            <span id={descriptionId} className={styles.description}>
              {description}
            </span>
          )}
          {error && (
            <span id={errorId} className={styles.error}>
              {error}
            </span>
          )}
        </span>
      )}
    </label>
  );
};
