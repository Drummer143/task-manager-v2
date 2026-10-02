import { isAxiosError } from 'axios';

import type { ErrorBody } from './generated/storage/schemas';

/**
 * The error body every backend service answers with (`error_handlers::ErrorBody`), or `undefined`
 * when `error` is not an HTTP error with such a body (network failure, abort, a proxy page).
 */
export const getErrorBody = (error: unknown): ErrorBody | undefined => {
  if (!isAxiosError(error)) return undefined;

  const data: unknown = error.response?.data;

  return typeof data === 'object' && data !== null && 'code' in data ? (data as ErrorBody) : undefined;
};

/** The stable error code (`NOT_FOUND`, `UPLOAD_TOKEN_INVALID`, ...), if the server sent one. */
export const getErrorCode = (error: unknown): ErrorBody['code'] | undefined => getErrorBody(error)?.code;

/** The HTTP status, if a response arrived at all. */
export const getStatusCode = (error: unknown): number | undefined =>
  isAxiosError(error) ? error.response?.status : undefined;
