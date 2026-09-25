import React from 'react';
import { cx } from '../../utils';
import { tooltipProps, type TooltipPlacement } from '../Tooltip';
import { Button, type ButtonProps } from './Button';
import styles from './Button.module.scss';

export interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'icon' | 'aria-label' | 'aria-labelledby'> {
  /** The only visible content. */
  icon: React.ReactNode;
  /** Required (spec): the accessible name and the tooltip text at once. */
  label: string;
  /** Preferred tooltip side, e.g. `right` in a collapsed sidebar. */
  tooltipPlacement?: TooltipPlacement;
}

/**
 * A Button with an icon and no visible text. Everything else — variants,
 * sizes, busy, disabled with a reason, link mode — is Button's own.
 * The hotkey goes into the tooltip next to the label: there is no room for it
 * on the button itself.
 */
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  keys,
  tooltipPlacement,
  disabled,
  disabledReason,
  className,
  variant = 'ghost',
  ...props
}) => (
  <Button
    {...props}
    // Ghost by default: toolbars and dense rows are where icon buttons live (spec).
    variant={variant}
    icon={icon}
    disabled={disabled}
    disabledReason={disabledReason}
    aria-label={label}
    className={cx(styles.iconOnly, className)}
    // A disabled button with a reason shows the reason from Button's wrapper;
    // a second trigger inside it would compete for the same hover.
    {...(disabled && disabledReason ? {} : tooltipProps({ text: label, keys, placement: tooltipPlacement }))}
  />
);
