/**
 * Why a sign-in did not finish, and what the callback screen says about it (design: Callback §04).
 */
import { ErrorResponse } from 'oidc-client-ts';

import { MeError } from './me';

export type AuthErrorCode =
  | 'auth.cancelled'
  | 'auth.state_mismatch'
  | 'auth.not_allowed'
  | 'auth.token_failed'
  | 'auth.idp_error'
  | 'auth.timeout'
  | 'auth.api_unavailable'
  | 'auth.offline'
  | 'auth.misconfigured';

export interface AuthError {
  code: AuthErrorCode;
  /** The provider's own words; only ever copied with the details, never shown. */
  description?: string;
  /** The account that was refused (`auth.not_allowed`). */
  email?: string;
  /** May be fixed by one quiet new sign-in before anything is shown. */
  silentRetry?: boolean;
}

/** The callback ran out of time (15 s). */
export class AuthTimeout extends Error {
  constructor() {
    super('Sign-in timed out');
    this.name = 'AuthTimeout';
  }
}

const MISCONFIGURED = new Set(['invalid_client', 'unauthorized_client', 'invalid_request', 'unsupported_response_type']);

/** Classifies a failure of `signinRedirectCallback` (authentik's answer, token exchange, checks). */
export function callbackError(error: unknown, online = navigator.onLine): AuthError {
  if (error instanceof AuthTimeout) return { code: 'auth.timeout' };

  if (error instanceof ErrorResponse) {
    const description = error.error_description ?? undefined;
    if (error.error === 'access_denied') return { code: 'auth.cancelled' };
    // The code expired or was used already (a second tab, Back, reload)
    if (error.error === 'invalid_grant') return { code: 'auth.token_failed', description, silentRetry: true };
    if (error.error && MISCONFIGURED.has(error.error)) return { code: 'auth.misconfigured', description };
    return { code: 'auth.idp_error', description: description ?? error.error ?? undefined };
  }

  if (error instanceof Error && error.message.includes('No matching state found in storage')) {
    return { code: 'auth.state_mismatch', silentRetry: true };
  }

  // The build has no VITE_AUTHORITY
  if (error instanceof Error && error.message.includes('No authority or metadataUrl configured')) {
    return { code: 'auth.misconfigured', description: error.message };
  }

  // fetch rejects alike for no network and for a CORS refusal; only the first is the user's
  if (error instanceof TypeError) {
    return online ? { code: 'auth.misconfigured', description: error.message } : { code: 'auth.offline' };
  }

  // An id_token that does not check out (issuer, nonce, signature, ...)
  return { code: 'auth.token_failed', description: error instanceof Error ? error.message : String(error) };
}

/** Classifies a failure of `GET /me`. */
export function meError(error: unknown, email?: string, online = navigator.onLine): AuthError {
  if (error instanceof MeError) {
    if (error.status === 403) return { code: 'auth.not_allowed', email };
    // The token was refused: the sign-in itself went wrong
    if (error.status === 401) return { code: 'auth.token_failed', description: 'GET /me answered 401' };
    if (error.status === undefined && !online) return { code: 'auth.offline' };
  }
  return { code: 'auth.api_unavailable', description: error instanceof Error ? error.message : String(error) };
}

export type MarkTone = 'danger' | 'accent' | 'neutral';

export interface ErrorScreen {
  mark: string;
  tone: MarkTone;
  title: string;
  /** `{email}` is replaced by the refused account, in bold. */
  text: string;
  /** The primary action; none while waiting for the network or when only the details help. */
  action?: string;
  /** Show the code and request id, with "Copy details": only for errors worth forwarding. */
  details: boolean;
}

const COULD_NOT_SIGN_IN: ErrorScreen = {
  mark: '!',
  tone: 'danger',
  title: 'We couldn’t sign you in',
  text: 'Sign-in didn’t finish. Try again in a moment.',
  action: 'Try again',
  details: true,
};

export const ERROR_SCREENS: Record<AuthErrorCode, ErrorScreen> = {
  'auth.cancelled': {
    mark: '×',
    tone: 'neutral',
    title: 'Sign-in cancelled',
    text: 'You closed the sign-in page or declined access. Nothing was changed.',
    action: 'Try again',
    details: false,
  },
  'auth.state_mismatch': {
    mark: '↻',
    tone: 'accent',
    title: 'This sign-in has expired',
    text: 'It was opened in another tab or already used. Start again to continue.',
    action: 'Sign in again',
    details: true,
  },
  'auth.not_allowed': {
    mark: '!',
    tone: 'danger',
    title: 'Your account can’t use this Verso',
    text: '{email} isn’t allowed to sign in here. Ask your administrator for access, or use another account.',
    action: 'Use another account',
    details: true,
  },
  'auth.token_failed': COULD_NOT_SIGN_IN,
  'auth.idp_error': COULD_NOT_SIGN_IN,
  'auth.timeout': COULD_NOT_SIGN_IN,
  'auth.api_unavailable': {
    mark: '!',
    tone: 'danger',
    title: 'We couldn’t reach Verso',
    text: 'You’re signed in, but Verso didn’t answer. Try again in a moment.',
    action: 'Retry',
    details: true,
  },
  'auth.offline': {
    mark: '⌁',
    tone: 'neutral',
    title: 'You’re offline',
    text: 'Sign-in will continue as soon as you’re back online.',
    details: false,
  },
  'auth.misconfigured': {
    mark: '!',
    tone: 'danger',
    title: 'Sign-in isn’t set up correctly',
    text: 'Ask your administrator. Details below.',
    details: true,
  },
};
