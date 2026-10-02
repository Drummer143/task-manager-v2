import { abortError, isAbort, toUploadError } from '../errors';

export interface RetryPolicy {
  /** Tries in total, the first one included. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * About a minute of retries in total: long enough to ride out a deploy of storage or a chunk slot
 * still held on the server by a request that a pause aborted.
 */
export const DEFAULT_RETRY: RetryPolicy = { attempts: 8, baseDelayMs: 500, maxDelayMs: 15_000 };

/** Resolves after `ms`, or rejects with an `AbortError` as soon as `signal` aborts. */
export const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** Exponential backoff with full jitter, so parallel chunks do not retry in lockstep. */
export const backoffDelay = (attempt: number, policy: RetryPolicy, random = Math.random): number =>
  random() * Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);

/**
 * Runs `task` until it succeeds, retrying errors that {@link toUploadError} calls retryable.
 * Other errors, aborts and the last failure are rethrown as they are.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  signal: AbortSignal,
  policy: RetryPolicy = DEFAULT_RETRY,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (isAbort(error) || signal.aborted) throw error;
      if (attempt + 1 >= policy.attempts || !toUploadError(error).retryable) throw error;
      await sleep(backoffDelay(attempt, policy), signal);
    }
  }
}
