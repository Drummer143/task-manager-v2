import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@task-manager-v2/ui-kit';

import { type AuthError, ERROR_SCREENS } from './auth-errors';
import { AuthActions, AuthDetails, AuthFrame, AuthStatus, AuthText, AuthTitle, Mark, Wordmark } from './AuthScreen';

export interface AuthErrorViewProps {
  error: AuthError;
  requestId: string;
  /** The primary action of this error (design: Callback §04). */
  onAction: () => void;
}

/** What "Copy details" puts on the clipboard: enough for an administrator, no secrets. */
export function detailsText(error: AuthError, requestId: string, now = new Date()): string {
  return [
    error.code,
    `req ${requestId}`,
    now.toISOString(),
    // The query is left out: on the callback page it held the one-time code
    `${window.location.origin}${window.location.pathname}`,
    error.description,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A sign-in that did not finish: what happened, what to do, and details worth forwarding. */
export const AuthErrorView: React.FC<AuthErrorViewProps> = ({ error, requestId, onAction }) => {
  const screen = ERROR_SCREENS[error.code];
  const title = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    title.current?.focus();
    document.title = 'Sign-in problem · Verso';
  }, [error.code]);

  // Enter runs the one action from anywhere on the screen; buttons handle their own Enter
  useEffect(() => {
    if (!screen.action) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      onAction();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen.action, onAction]);

  const copy = () => {
    void navigator.clipboard?.writeText(detailsText(error, requestId)).then(() => setCopied(true));
  };

  const [before, after] = screen.text.split('{email}');

  return (
    <AuthFrame role="alert">
      <Wordmark />
      <Mark tone={screen.tone}>{screen.mark}</Mark>
      <AuthTitle ref={title}>{screen.title}</AuthTitle>
      <AuthText>
        {after === undefined ? (
          before
        ) : (
          <>
            {error.email ? <b>{error.email}</b> : 'This account'}
            {after}
          </>
        )}
      </AuthText>
      {screen.action && (
        <AuthActions>
          <Button variant="primary" keys="enter" onClick={onAction}>
            {screen.action}
          </Button>
        </AuthActions>
      )}
      {error.code === 'auth.offline' && <AuthStatus>Waiting for connection…</AuthStatus>}
      {screen.details && (
        <AuthDetails
          code={error.code}
          requestId={requestId}
          copyLabel={copied ? 'Copied' : 'Copy details'}
          onCopy={copy}
        />
      )}
    </AuthFrame>
  );
};

export default AuthErrorView;
