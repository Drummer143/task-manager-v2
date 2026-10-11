import React from 'react';
import { tooltipProps } from '../Tooltip';
import { useLinkClick, useLinkHref } from '../../router';

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

/** `_blank` always gets noopener noreferrer, on top of whatever rel was passed. */
const relFor = (target: string | undefined, rel: string | undefined) => {
  if (target !== '_blank') {
    return rel;
  }

  const tokens = new Set(rel?.split(/\s+/).filter(Boolean));
  tokens.add('noopener');
  tokens.add('noreferrer');

  return [...tokens].join(' ');
};

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
            rel: relFor(target, rel),
            onClick: onClickHandler,
          })}
    >
      {children}
    </a>
  );
};
