import { AxiosError, AxiosHeaders, type AxiosResponse, CanceledError } from 'axios';

import { abortError, isAbort, toUploadError } from './errors';
import { networkError, storageError } from './testing/fake-storage';

const responseWithBody = (status: number, data: unknown) =>
  new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  } as AxiosResponse);

describe('toUploadError', () => {
  it('takes code, params and trace id from the error contract', () => {
    const error = storageError(429, 'TOO_MANY_CONCURRENT_UPLOADS', { max_concurrent: 3 });
    (error.response?.data as Record<string, unknown>)['trace_id'] = 'trace-1';

    expect(toUploadError(error)).toEqual({
      code: 'TOO_MANY_CONCURRENT_UPLOADS',
      message: 'Storage answered 429 TOO_MANY_CONCURRENT_UPLOADS',
      status: 429,
      params: { max_concurrent: 3 },
      traceId: 'trace-1',
      retryable: true,
    });
  });

  it('treats any 5xx as retryable', () => {
    expect(toUploadError(storageError(500, 'INTERNAL')).retryable).toBe(true);
    expect(toUploadError(storageError(400, 'MALFORMED_REQUEST')).retryable).toBe(false);
  });

  it('reports a missing response as a network error', () => {
    expect(toUploadError(networkError())).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('copes with responses that are not the error contract', () => {
    expect(toUploadError(responseWithBody(502, '<html>Bad gateway</html>'))).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 502,
      retryable: true,
    });
    expect(toUploadError(responseWithBody(404, ''))).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 404,
      retryable: false,
    });
  });

  it('recognises a file that can no longer be read', () => {
    expect(toUploadError(new DOMException('gone', 'NotReadableError'))).toMatchObject({
      code: 'FILE_UNREADABLE',
      retryable: false,
    });
  });

  it('falls back to INTERNAL for anything else', () => {
    expect(toUploadError(new Error('boom'))).toEqual({ code: 'INTERNAL', message: 'boom', retryable: false });
    expect(toUploadError('weird')).toMatchObject({ code: 'INTERNAL', message: 'weird' });
  });
});

describe('isAbort', () => {
  it('recognises axios cancellations and abort errors only', () => {
    expect(isAbort(new CanceledError())).toBe(true);
    expect(isAbort(abortError())).toBe(true);
    expect(isAbort(networkError())).toBe(false);
  });
});
