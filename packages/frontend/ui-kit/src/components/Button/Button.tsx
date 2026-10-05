import React from 'react';
import { cx } from '../../utils';
import styles from './Button.module.scss';
import Kbd from '../Kbd';
import { Spinner } from '../Spinner';
import { ButtonVariant, ButtonSize } from './types';
import { BUTTON_VARIANT_TO_SPINNER_VARIANT } from './constants';
import { useDelayedFlag } from '../../hooks';
import { tooltipProps, type TooltipPlacement } from '../Tooltip';
import { LinkBase, type LinkBaseProps } from '../Link';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  keys?: string;
  loading?: boolean;
  /** Tooltip text; `keys` are shown in it too. */
  tooltip?: string;
  /** Preferred tooltip side, e.g. `right` in a collapsed sidebar. */
  tooltipPlacement?: TooltipPlacement;
  /** Why the button is disabled; shown in a tooltip and readable from the keyboard. */
  disabledReason?: string;

  /** If present, renders a link (LinkBase) instead of a <button>. */
  href?: string;
  target?: '_blank' | '_self';
  rel?: string;
  download?: boolean | string;
  /** With `href`: replace the history entry instead of pushing one. */
  replace?: boolean;
  /** With `href`: a plain browser navigation on the same origin, past the router. */
  reloadDocument?: boolean;

  ref?: React.Ref<HTMLButtonElement & HTMLAnchorElement>;
}

const isEmpty = (node: React.ReactNode) => node === undefined || node === null || node === false || node === '';

export const Button: React.FC<ButtonProps> = ({
  keys,
  icon,
  size = 'md',
  variant = 'secondary',
  loading = false,
  disabled = false,
  disabledReason,
  tooltip,
  tooltipPlacement,
  children,
  className,
  href,
  target,
  rel,
  download,
  replace,
  reloadDocument,
  type = 'button',
  onClick,
  ...props
}) => {
  // Only the picture waits: the spinner appears after its delay, while busy
  // logic (aria-busy, ignoring presses) reacts at once.
  const showSpinner = useDelayedFlag(loading);

  const hasIcon = !isEmpty(icon);
  const iconOnly = hasIcon && isEmpty(children);
  // No icon to stand in for: the spinner takes the label's place (spec 02, 03).
  const spinnerOverLabel = showSpinner && !hasIcon;
  const spinner = (
    // An icon-only button takes the icon's size; next to a label it is xs (spec 02).
    <Spinner size={iconOnly ? 'sm' : 'xs'} variant={BUTTON_VARIANT_TO_SPINNER_VARIANT[variant]} />
  );
  const label = (
    <>
      {children}

      {/* No room for it next to an icon alone: there it lives in the tooltip. */}
      {keys && !iconOnly && <Kbd keys={keys} variant="inline" className={styles.keys} />}
    </>
  );
  const reason = disabled && disabledReason ? disabledReason : undefined;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement & HTMLAnchorElement>) => {
    // Disabled is aria-disabled, not the native attribute: the element keeps
    // pointer events and focus (for its reason), so the press is dropped here.
    // Busy: a repeated press is ignored (spec).
    // A link's navigation follows only if this one leaves the event alone.
    if (loading || disabled) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  // The reason wins over the text in the host; both may sit on one element.
  const tooltipAttributes = reason
    ? tooltipProps({ reason, text: tooltip, keys, placement: tooltipPlacement })
    : tooltip
      ? tooltipProps({ text: tooltip, keys, placement: tooltipPlacement })
      : undefined;

  const common = {
    ...props,
    ...tooltipAttributes,
    className: cx(styles.button, styles[size], styles[variant], iconOnly && styles.iconOnly, className),
    'aria-busy': loading || undefined,
    'aria-disabled': disabled || undefined,
    onClick: handleClick,
    children: (
      <>
        {hasIcon && (
          // One slot for the icon and the spinner that replaces it: the button
          // keeps its width. Decorative — the name comes from the label.
          <span className={cx(styles.icon, !showSpinner && styles.glyph)} aria-hidden="true">
            {showSpinner ? spinner : icon}
          </span>
        )}

        {spinnerOverLabel ? (
          <>
            {/* Transparent, not removed: it keeps the width and the accessible name. */}
            <span className={styles.labelHidden}>{label}</span>
            <span className={styles.spinnerOverlay} aria-hidden="true">
              {spinner}
            </span>
          </>
        ) : (
          label
        )}
      </>
    ),
  };

  if (href !== undefined) {
    return (
      // A link that looks like a button stays a link (spec): LinkBase does the
      // router, rel and disabled (no href, still focusable and named a link, so
      // the reason is reachable from the keyboard like on a button).
      <LinkBase
        {...(common as Omit<LinkBaseProps, 'href'>)}
        href={href}
        disabled={disabled}
        target={target}
        rel={rel}
        download={download}
        replace={replace}
        reloadDocument={reloadDocument}
      />
    );
  }

  return <button {...common} type={type} />;
};
