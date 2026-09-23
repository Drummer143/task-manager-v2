import type { ComponentPropsWithRef } from 'react';
import { Fragment, useMemo } from 'react';
import { cx, detectPlatform } from '../../utils';
import { formatKeys, toInlineText, toSpokenText } from './formatKeys';
import styles from './Kbd.module.css';

/**
 * `key` — keycaps with a border: cheat sheet, tooltip, palette, prose.
 * `inline` — plain muted text: inside a button, menu item or field. The parent
 * picks it (Button and MenuItem render `inline` themselves).
 */
export type KbdVariant = 'key' | 'inline';

/** Word between the steps of a sequence (`G then B`). */
export const KBD_THEN_LABEL = 'then';

export interface KbdProps extends Omit<ComponentPropsWithRef<'kbd'>, 'children'> {
  /**
   * Key notation. `+` joins keys pressed together, a space separates steps:
   * `'s'`, `'mod+k'`, `'mod+shift+c'`, `'g b'`. `mod` is ⌘ on Apple, Ctrl elsewhere.
   */
  keys: string;
  variant?: KbdVariant;
}

export function Kbd({ keys, variant = 'key', className, ...rest }: KbdProps) {
  const platform = useMemo(detectPlatform, []);
  const steps = useMemo(() => formatKeys(keys, platform), [keys, platform]);

  return (
    <kbd {...rest} className={cx(styles.root, variant === 'inline' && styles.inline, className)} data-variant={variant}>
      <span className={styles.srOnly}>{toSpokenText(steps, KBD_THEN_LABEL)}</span>

      {variant === 'inline' ? (
        <span aria-hidden="true">{toInlineText(steps)}</span>
      ) : (
        steps.map((step, stepIndex) => (
          <Fragment key={stepIndex}>
            {stepIndex > 0 && (
              <span className={styles.then} aria-hidden="true">
                {KBD_THEN_LABEL}
              </span>
            )}
            {step.map((key, keyIndex) => (
              <kbd key={keyIndex} className={styles.cap} aria-hidden="true">
                {key.label}
              </kbd>
            ))}
          </Fragment>
        ))
      )}
    </kbd>
  );
}

export default Kbd;
