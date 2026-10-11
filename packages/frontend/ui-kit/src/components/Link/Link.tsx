import React from 'react';
import { LinkBase, type LinkBaseProps } from './LinkBase';
import { ArrowUpRightIcon } from '../../icons';
import { useMessages } from '../../messages';
import { isExternalHref } from '../../router';
import { cx } from '../../utils';
import styles from './Link.module.scss';

export type LinkVariant = 'inline' | 'standalone' | 'subtle';

/** Standalone is the base look (no underline at rest), so it has no class of its own. */
const VARIANT_CLASS: Record<LinkVariant, string | undefined> = {
  inline: styles.inline,
  standalone: undefined,
  subtle: styles.subtle,
};

export interface LinkProps extends Omit<LinkBaseProps, 'disabled' | 'disabledReason'> {
  variant?: LinkVariant;
  current?: boolean;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({
  href,
  target,
  variant = 'inline',
  current,
  children,
  className,
  ...otherProps
}) => {
  const messages = useMessages();
  const resolvedTarget = target ?? (isExternalHref(href) ? '_blank' : undefined);
  const opensNewTab = resolvedTarget === '_blank';

  return (
    <LinkBase
      aria-current={current ? 'page' : undefined}
      {...otherProps}
      href={href}
      target={resolvedTarget}
      className={cx(styles.link, VARIANT_CLASS[variant], current && styles.current, className)}
    >
      {children}
      {opensNewTab && (
        <>
          <ArrowUpRightIcon className={styles.ext} />
          <span className={styles.srOnly}> {messages.linkOpensNewTab}</span>
        </>
      )}
    </LinkBase>
  );
};

export default Link;
