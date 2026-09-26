import React, { cloneElement, isValidElement, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as popover from '@zag-js/popover';
import { mergeProps, normalizeProps, useMachine } from '@zag-js/react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { XIcon } from '../../icons';
import { useMessages } from '../../messages';
import { positionerStyle, useCloseWhenDetached, useExclusiveOverlay, usePresence } from '../../overlay';
import { IconButton } from '../Button';
import { Surface } from '../Surface';
import styles from './Popover.module.scss';

export interface PopoverProps {
  /** Controlled open state; omit it and the popover keeps its own. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
  defaultOpen?: boolean;
  /** Any kit button (or element) — it gets the ref-free props it needs: aria, id, the toggle. */
  trigger: React.ReactElement;
  side?: 'bottom' | 'top' | 'right' | 'left';
  align?: 'start' | 'end';
  /** A header with the title and ×. Without it the popover needs `aria-label`. */
  title?: string;
  /** Actions at the bottom right, over a hairline. */
  footer?: React.ReactNode;
  /** 300 or 360 px. Bigger than 360 × 320 is not a popover but a panel (spec). */
  width?: 'default' | 'wide';
  /** What gets focus on open; default — the first interactive element. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  'aria-label'?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A non-modal panel tied to an element (spec: Popover): a short choice, a
 * setting, an explanation with a link. Behavior — Zag's popover machine
 * (position, focus, Tab out, close); look — ours. One overlay at a time; it
 * closes when its trigger scrolls out of view; Esc closes it and the Esc
 * ladder does not take a second step.
 */
export const Popover: React.FC<PopoverProps> = ({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  side = 'bottom',
  align = 'start',
  title,
  footer,
  width = 'default',
  initialFocus,
  'aria-label': ariaLabel,
  className,
  children,
}) => {
  const messages = useMessages();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const service = useMachine(popover.machine, {
    id: useId(),
    open,
    defaultOpen,
    onOpenChange: (details) => onOpenChange?.(details.open),
    initialFocusEl: initialFocus ? () => initialFocus.current : undefined,
    positioning: {
      placement: `${side}-${align}`,
      gutter: raw['menu-offset'],
      overflowPadding: raw['overlay-margin'],
      flip: true,
      slide: true,
    },
  });
  const api = popover.connect(service, normalizeProps);
  const positioner = api.getPositionerProps();
  const close = () => api.setOpen(false);
  const mounted = usePresence(api.open, contentRef);

  const getTrigger = () => document.getElementById(api.getTriggerProps().id as string);

  useExclusiveOverlay(api.open, close);
  useCloseWhenDetached(api.open, getTrigger, close);

  const triggerElement = isValidElement<Record<string, unknown>>(trigger)
    ? cloneElement(trigger, mergeProps(trigger.props, api.getTriggerProps()))
    : trigger;

  return (
    <>
      {triggerElement}
      {mounted &&
        createPortal(
          // data-layer: triggers under the popover get no tooltips (spec 10).
          <div {...positioner} style={positionerStyle(positioner.style)} data-layer="">
            {/* Always the default surface, wherever it opens from. */}
            <Surface tone="default" asChild>
              <div
                {...api.getContentProps()}
                ref={contentRef}
                // Zag hides it on close at once; it stays for the exit animation.
                hidden={!mounted}
                aria-label={title ? undefined : ariaLabel}
                className={cx(styles.content, width === 'wide' && styles.wide, !title && styles.untitled, className)}
              >
                {title && (
                  <div className={styles.header}>
                    <h2 {...api.getTitleProps()} className={styles.title}>
                      {title}
                    </h2>
                    <IconButton
                      {...api.getCloseTriggerProps()}
                      className={styles.close}
                      size="sm"
                      icon={<XIcon />}
                      label={messages.close}
                    />
                  </div>
                )}
                <div className={styles.body}>{children}</div>
                {footer && <div className={styles.footer}>{footer}</div>}
              </div>
            </Surface>
          </div>,
          document.body,
        )}
    </>
  );
};
