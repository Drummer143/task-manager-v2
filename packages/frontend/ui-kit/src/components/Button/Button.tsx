import React, { useId } from 'react';
import { cx } from '../../utils';
import styles from './Button.module.scss';
import Kbd from '../Kbd';
import { Spinner } from '../Spinner';
import { ButtonVariant, ButtonSize } from './types';
import { BUTTON_VARIANT_TO_SPINNER_VARIANT } from './constants';
import { useDelayedFlag } from '../../hooks';
import { tooltipProps } from '../Tooltip';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  keys?: string;
  loading?: boolean;
  /** Why the button is disabled; shown in a tooltip and readable from the keyboard. */
  disabledReason?: string;

  /** If present, renders an <a> instead of a <button> */
  href?: string;
  target?: '_blank' | '_self';
  rel?: string;
  download?: boolean | string;

  ref?: React.Ref<HTMLButtonElement & HTMLAnchorElement>;
}

export const Button: React.FC<ButtonProps> = ({
  keys,
  icon,
  size = 'md',
  variant = 'primary',
  loading = false,
  disabled = false,
  disabledReason,
  children,
  className,
  href,
  target,
  rel,
  download,
  type = 'button',
  onClick,
  ...props
}) => {
  // Only the picture waits: the spinner appears after its delay, while busy
  // logic (aria-busy, ignoring presses) reacts at once.
  const showSpinner = useDelayedFlag(loading);
  const reasonId = useId();
  const reason = disabled && disabledReason ? disabledReason : undefined;

  const handleClick = (
    event: React.MouseEvent<HTMLButtonElement & HTMLAnchorElement>,
  ) => {
    // Busy: a repeated press is ignored (spec). A disabled link has no href,
    // but a click must not reach the caller either.
    if (loading || disabled) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  const common = {
    ...props,
    className: cx(styles.button, styles[size], styles[variant], className),
    'aria-busy': loading || undefined,
    'aria-describedby': reason ? reasonId : props['aria-describedby'],
    onClick: handleClick,
    children: (
      <>
        {showSpinner ? (
          // In place of the icon (spec); aria-busy already tells readers.
          <Spinner
            size="xs"
            variant={BUTTON_VARIANT_TO_SPINNER_VARIANT[variant]}
            aria-hidden="true"
          />
        ) : (
          icon
        )}

        {children}

        {keys && <Kbd keys={keys} variant="inline" />}
      </>
    ),
  };

  const element =
    href !== undefined ? (
      // A link that looks like a button stays a link (spec): no role="button".
      <a
        {...(common as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        // `disabled` does not exist on <a>: drop the href and say it instead.
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        target={target}
        rel={rel}
        download={download}
      />
    ) : (
      <button {...common} type={type} disabled={disabled} />
    );

  if (!reason) {
    return element;
  }

  // A disabled button gets no pointer events and no focus, so the reason lives
  // on a focusable wrapper (spec); the hidden text is its accessible description.
  return (
    <span
      className={styles.reasonWrapper}
      tabIndex={0}
      {...tooltipProps({ reason })}
    >
      {element}
      <span id={reasonId} hidden>
        {reason}
      </span>
    </span>
  );
};
