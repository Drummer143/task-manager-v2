import React, { useEffect, useState } from 'react';
import { raw } from '../../tokens';
import { useMessages } from '../../messages';
import { StateLayout, type StateAction, type StateScale } from './StateLayout';

export interface ErrorStateProps {
  /** Default `area`. Never wider than what broke: a section's error stays in the section. */
  scale?: StateScale;
  /** What happened: 'Couldn’t load this board'. */
  title: string;
  /** Why, if known: 'The server didn’t respond.' */
  reason?: string;
  /** Say it plainly what happened to the data — the first fear with any error. */
  dataSafe?: 'safe' | 'unchanged';
  onRetry?(): void;
  /** Code and request id: copied by “Copy error details”, never shown. */
  details?: string;
  /** A step of the place's own, after Retry: 'Remove' for a failed upload. */
  secondary?: StateAction;
  className?: string;
}

/**
 * Says what broke, exactly where it broke (spec: States · 03): what
 * happened, why, what it did to the data, what to do. Retry is the main
 * step; on an area Enter retries while the state itself has focus (the
 * screen may focus it). No access is not an error — it is an empty state
 * with who to ask.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  scale = 'area',
  title,
  reason,
  dataSafe,
  onRetry,
  details,
  secondary,
  className,
}) => {
  const messages = useMessages();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), raw['copied-hold']);

    return () => clearTimeout(timer);
  }, [copied]);

  const safety = dataSafe === 'safe' ? messages.dataSafe : dataSafe === 'unchanged' ? messages.dataUnchanged : undefined;
  const description = [reason, safety].filter(Boolean).join(' ') || undefined;

  const retry: StateAction | undefined = onRetry && {
    label: messages.retry,
    onAction: onRetry,
    keys: scale === 'area' ? 'Enter' : undefined,
  };
  const copy: StateAction | undefined = details
    ? {
        label: copied ? messages.errorDetailsCopied : messages.copyErrorDetails,
        onAction: () => {
          void navigator.clipboard?.writeText(details).then(() => setCopied(true), () => undefined);
        },
      }
    : undefined;

  const area = scale === 'area';

  return (
    <StateLayout
      scale={scale}
      tone="danger"
      role="alert"
      title={title}
      description={description}
      // An area holds two buttons at most; a line has room for all three links.
      actions={[retry, secondary, copy].filter((action) => action !== undefined).slice(0, area ? 2 : 3)}
      className={className}
      // Focusable by the screen, not by Tab: Enter on it retries.
      tabIndex={area && onRetry ? -1 : undefined}
      onKeyDown={
        area && onRetry
          ? (event) => {
              if (event.key === 'Enter' && event.target === event.currentTarget) {
                event.preventDefault();
                onRetry();
              }
            }
          : undefined
      }
    />
  );
};
