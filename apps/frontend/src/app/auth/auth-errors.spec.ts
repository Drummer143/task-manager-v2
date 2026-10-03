import { ErrorResponse } from 'oidc-client-ts';

import { AuthTimeout, callbackError, meError } from './auth-errors';
import { MeError } from './me';

const providerError = (error: string, error_description?: string) => new ErrorResponse({ error, error_description });

describe('callbackError', () => {
  it('maps the provider answers', () => {
    expect(callbackError(providerError('access_denied'))).toEqual({ code: 'auth.cancelled' });
    expect(callbackError(providerError('invalid_grant', 'expired'))).toEqual({
      code: 'auth.token_failed',
      description: 'expired',
      silentRetry: true,
    });
    expect(callbackError(providerError('invalid_client')).code).toBe('auth.misconfigured');
    expect(callbackError(providerError('server_error'))).toEqual({ code: 'auth.idp_error', description: 'server_error' });
    expect(callbackError(providerError('server_error', 'database down'))).toEqual({
      code: 'auth.idp_error',
      description: 'database down',
    });
  });

  it('describes anything else as a failed sign-in', () => {
    expect(callbackError('weird')).toEqual({ code: 'auth.token_failed', description: 'weird' });
  });

  it('recognises a lost transaction, a timeout and a broken token', () => {
    expect(callbackError(new Error('No matching state found in storage'))).toEqual({
      code: 'auth.state_mismatch',
      silentRetry: true,
    });
    expect(callbackError(new AuthTimeout()).code).toBe('auth.timeout');
    expect(callbackError(new Error('Invalid issuer in token')).code).toBe('auth.token_failed');
  });

  it('tells no network from a CORS refusal', () => {
    expect(callbackError(new TypeError('Failed to fetch'), false).code).toBe('auth.offline');
    expect(callbackError(new TypeError('Failed to fetch'), true).code).toBe('auth.misconfigured');
  });
});

describe('meError', () => {
  it('maps the answers of /me', () => {
    expect(meError(new MeError(403, 'r'), 'a@x.test')).toEqual({ code: 'auth.not_allowed', email: 'a@x.test' });
    expect(meError(new MeError(401, 'r')).code).toBe('auth.token_failed');
    expect(meError(new MeError(503, 'r')).code).toBe('auth.api_unavailable');
    expect(meError(new MeError(undefined, 'r'), undefined, false).code).toBe('auth.offline');
    expect(meError(new MeError(undefined, 'r'), undefined, true).code).toBe('auth.api_unavailable');
    expect(meError('weird', undefined, true)).toEqual({ code: 'auth.api_unavailable', description: 'weird' });
  });
});
