import { getErrorBody, getStatusCode } from '@task-manager-v2/api';
import { isAxiosError, isCancel } from 'axios';

import type { UploadError } from './types';

/** Codes that mean "the same request may succeed later". */
const TRANSIENT_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'INTERNAL',
  'UPSTREAM_UNAVAILABLE',
  // storage limits chunks in flight per upload. A request aborted by a pause can hold its slot on
  // the server for up to a minute, so this clears up by itself.
  'TOO_MANY_CONCURRENT_UPLOADS',
]);

/** A request cancelled through its `AbortSignal` (pause, cancel), or an aborted wait. */
export const isAbort = (error: unknown): boolean =>
  isCancel(error) || (error instanceof DOMException && error.name === 'AbortError');

export const abortError = () => new DOMException('Aborted', 'AbortError');

/** Any thrown value as an {@link UploadError}. */
export function toUploadError(error: unknown): UploadError {
  const body = getErrorBody(error);
  if (body) {
    return {
      code: body.code,
      message: `Storage answered ${body.status} ${body.code}`,
      status: body.status,
      params: 'params' in body ? (body.params as Record<string, unknown>) : undefined,
      traceId: body.trace_id ?? undefined,
      retryable: TRANSIENT_CODES.has(body.code) || body.status >= 500,
    };
  }

  if (isAxiosError(error)) {
    const status = getStatusCode(error);
    // No response at all: offline, DNS, CORS, connection reset
    if (status === undefined) {
      return { code: 'NETWORK_ERROR', message: error.message, retryable: true };
    }
    // A response that is not the error contract (a proxy page, for instance)
    return {
      code: status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UNEXPECTED_RESPONSE',
      message: `Storage answered ${status}`,
      status,
      retryable: status >= 500,
    };
  }

  // Reading a File fails like this when it was changed or deleted on disk after being picked
  if (error instanceof DOMException && error.name === 'NotReadableError') {
    return { code: 'FILE_UNREADABLE', message: 'The file can no longer be read', retryable: false };
  }

  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}
