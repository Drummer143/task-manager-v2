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
      // Unavailable, it is no link at all: nothing to open, save or follow
      {...(disabled
        ? disabledReason && tooltipProps({ reason: disabledReason })
        : {
            href,
            target,
            download,
            rel: target === '_blank' ? cx(rel, 'noopener noreferrer') : rel,
            onClick: onClickHandler,
          })}
    >
      {children}
    </a>
  );
};
