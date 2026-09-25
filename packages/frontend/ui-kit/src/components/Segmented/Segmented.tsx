import React, { useRef } from 'react';
import { cx } from '../../utils';
import { Kbd } from '../Kbd';
import { tooltipProps } from '../Tooltip';
import styles from './Segmented.module.scss';

export interface SegmentedOption<T extends string> {
  value: T;
  /** The visible text, or — for an icon-only segment — its name and tooltip. */
  label: string;
  icon?: React.ReactNode;
  /** Only the icon is shown; the label moves into aria-label and the tooltip. */
  iconOnly?: boolean;
  /** Hotkey hint (`'g b'`). The app binds it; the segment only shows it. */
  keys?: string;
  /** Unavailable, and why: skipped by the arrows, explained by a tooltip. */
  disabledReason?: string;
}

type NativeGroupProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue' | 'role' | 'children'>;

export interface SegmentedProps<T extends string> extends NativeGroupProps {
  /** Controlled (spec 00): the choice applies at once. */
  value: T;
  onValueChange(value: T): void;
  /** 2–4 options, all visible. More, or long labels — that is a Select. */
  options: ReadonlyArray<SegmentedOption<T>>;
  /** md — the view switcher (--segmented-height); sm — period, density. */
  size?: 'md' | 'sm';
  /** The whole group is unavailable; `disabledReason` says why. */
  disabled?: boolean;
  disabledReason?: string;
  /** Required: the group has no visible caption of its own. */
  'aria-label': string;
  ref?: React.Ref<HTMLDivElement>;
}

const NEXT_KEYS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/*
 * Generic over the option values, so not `React.FC` (the kit's usual form):
 * an FC cannot carry a type parameter, and `value` / `onValueChange` must be
 * typed as the union the owner passes (`'board' | 'table'`), not as string.
 */

/**
 * A radio group drawn as segments (spec 07): one Tab stop for the whole
 * group, ←/→ choose and apply at once, unavailable segments are skipped. The
 * chosen segment has an inner accent outline — no fill, no sliding thumb.
 */
export const Segmented = <T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  disabled = false,
  disabledReason,
  className,
  onKeyDown,
  ref,
  ...props
}: SegmentedProps<T>): React.ReactElement => {
  const segments = useRef(new Map<T, HTMLButtonElement>());
  const isAvailable = (option: SegmentedOption<T>) => !disabled && option.disabledReason === undefined;
  const reason = disabled && disabledReason ? disabledReason : undefined;

  // The one Tab stop: the chosen segment, or the first available if the chosen one is not.
  const chosen = options.find((option) => option.value === value);
  const tabStop = chosen && (isAvailable(chosen) || disabled) ? chosen.value : options.find(isAvailable)?.value;

  const choose = (option: SegmentedOption<T>) => {
    segments.current.get(option.value)?.focus();

    if (option.value !== value) {
      onValueChange(option.value);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    const available = options.filter(isAvailable);

    if (event.defaultPrevented || available.length === 0) {
      return;
    }

    const current = available.findIndex((option) => option.value === value);
    let target: SegmentedOption<T> | undefined;

    if (event.key in NEXT_KEYS) {
      const step = NEXT_KEYS[event.key];
      const from = current === -1 ? (step === 1 ? -1 : 0) : current;
      // Round the group, like native radios.
      target = available[(from + step + available.length) % available.length];
    } else if (event.key === 'Home') {
      target = available[0];
    } else if (event.key === 'End') {
      target = available[available.length - 1];
    }

    if (target) {
      event.preventDefault();
      choose(target);
    }
  };

  return (
    <div
      {...props}
      ref={ref}
      role="radiogroup"
      className={cx(styles.group, styles[size], className)}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? '' : undefined}
      onKeyDown={handleKeyDown}
      {...(reason ? tooltipProps({ reason }) : undefined)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const available = isAvailable(option);
        const iconOnly = Boolean(option.iconOnly && option.icon);
        const tooltip =
          !disabled && option.disabledReason !== undefined
            ? tooltipProps({ reason: option.disabledReason })
            : iconOnly
              ? // An icon alone always gets a tooltip with its name and hotkey (spec 07).
                tooltipProps({ text: option.label, keys: option.keys })
              : undefined;

        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) {
                segments.current.set(option.value, node);
              } else {
                segments.current.delete(option.value);
              }
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!available || undefined}
            aria-label={iconOnly ? option.label : undefined}
            tabIndex={option.value === tabStop ? 0 : -1}
            className={cx(styles.segment, iconOnly && styles.iconOnly)}
            data-selected={selected ? '' : undefined}
            onClick={() => {
              if (available) {
                choose(option);
              }
            }}
            {...tooltip}
          >
            {option.icon && (
              <span className={styles.icon} aria-hidden="true">
                {option.icon}
              </span>
            )}
            {!iconOnly && option.label}
            {!iconOnly && option.keys && <Kbd keys={option.keys} variant="inline" />}
          </button>
        );
      })}
    </div>
  );
};
