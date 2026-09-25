import React, { useId } from 'react';
import { cx } from '../../utils';
import { tooltipProps } from '../Tooltip';
import { useMessages } from '../../messages';
import styles from './Switch.module.scss';

type NativeSwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange' | 'value' | 'children'
>;

export interface SwitchProps extends NativeSwitchProps {
  /** Controlled (spec 00). The thumb moves at once — the save is optimistic. */
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  /** Describes the ON state: "Show completed", not "Show / hide completed". */
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The server has not confirmed yet: a quiet dot, nothing blocks. */
  pending?: boolean;
  /** The save failed and the thumb went back: the line under the label. */
  error?: string;
  /** Shown with the error as "Retry". */
  onRetry?(): void;
  /** `start` — label first (a settings row); `end` — switch first (a toolbar). */
  labelPosition?: 'start' | 'end';
  /** Why it is disabled: shown in a tooltip, readable from the keyboard. */
  disabledReason?: string;
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * A setting that applies at once (spec 06): density, notifications, "show
 * completed". A native checkbox with role="switch" — Space toggles, readers say
 * "on / off". Never asks for confirmation: if it needs one, it is not a switch.
 * `className` goes on the row, the ref and other DOM props on the input.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  pending = false,
  error,
  onRetry,
  labelPosition = 'start',
  disabled = false,
  disabledReason,
  className,
  ref,
  ...props
}) => {
  const descriptionId = useId();
  const errorId = useId();
  const messages = useMessages();
  const reason = disabled && disabledReason ? disabledReason : undefined;

  const text = (
    <span className={styles.text}>
      <span className={styles.label}>
        {label}
        {pending && <span className={styles.dot} aria-hidden="true" />}
      </span>
      {description !== undefined && (
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      )}
    </span>
  );

  return (
    <div
      className={cx(styles.root, className)}
      data-position={labelPosition}
      data-checked={checked ? 'true' : 'false'}
      data-disabled={disabled ? '' : undefined}
    >
      <label className={styles.row} {...(reason ? tooltipProps({ reason }) : undefined)}>
        {labelPosition === 'start' && text}

        <span className={styles.track}>
          <input
            {...props}
            ref={ref}
            type="checkbox"
            role="switch"
            className={styles.input}
            checked={checked}
            aria-disabled={disabled || undefined}
            aria-busy={pending || undefined}
            aria-describedby={
              cx(props['aria-describedby'], description !== undefined && descriptionId, error && errorId) || undefined
            }
            // No preventDefault when disabled (see Checkbox): React puts `checked` back.
            onChange={() => {
              if (!disabled) {
                onCheckedChange(!checked);
              }
            }}
          />
          <span className={styles.thumb} aria-hidden="true" />
        </span>

        {labelPosition === 'end' && text}
      </label>

      {error && (
        // Outside the label: a button inside it would be a second control of one label.
        <div id={errorId} className={styles.error}>
          {error}
          {onRetry && (
            <>
              {' · '}
              <button type="button" className={styles.retry} onClick={onRetry}>
                {messages.retry}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
