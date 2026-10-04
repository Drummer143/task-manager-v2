import React from 'react';
import { tooltipProps } from '../Tooltip';
import { useLinkClick, useLinkHref } from '../../router';
import { cx } from '../../utils';

export interface LinkBaseProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> {
  href: string;

  ref?: React.Ref<HTMLAnchorElement>;
  replace?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  reloadDocument?: boolean;
}

export const LinkBase: React.FC<LinkBaseProps> = ({
  rel,
  href: rawHref,
  target,
  replace,
  onClick,
  children,
  download,
  disabled,
  reloadDocument,
  disabledReason,
  ...otherProps
}) => {
  const onClickHandler = useLinkClick({
    href: rawHref,
    target,
    replace,
    onClick,
    download,
    reloadDocument,
  });

  const href = useLinkHref(rawHref);

  return (
    <a
      role={disabled ? 'link' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? 0 : undefined}

      {...otherProps}

      rel={target === '_blank' ? cx(rel, 'noopener noreferrer') : rel}
      href={disabled ? undefined : href}
      target={target}
      onClick={disabled ? undefined : onClickHandler}
      download={download}

      {...(disabledReason && disabled
        ? tooltipProps({ reason: disabledReason })
        : null)}
    >
      {children}
    </a>
  );
};
