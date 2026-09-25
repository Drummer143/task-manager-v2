import React from 'react';
import { Button, type ButtonProps } from './Button';

export interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'icon' | 'tooltip' | 'aria-label' | 'aria-labelledby'> {
  /** The only visible content. */
  icon: React.ReactNode;
  /** Required (spec): the accessible name and the tooltip text at once. */
  label: string;
}

/**
 * A Button with an icon and no visible text. Everything else — variants,
 * sizes, busy, disabled with a reason, link mode, the square shape — is
 * Button's own. The hotkey goes into the tooltip next to the label: there is
 * no room for it on the button itself.
 */
export const IconButton: React.FC<IconButtonProps> = ({ icon, label, variant = 'ghost', ...props }) => (
  <Button
    {...props}
    // Ghost by default: toolbars and dense rows are where icon buttons live (spec).
    variant={variant}
    icon={icon}
    aria-label={label}
    tooltip={label}
  />
);
