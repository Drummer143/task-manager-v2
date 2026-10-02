import { networkError, storageError } from '../testing/fake-storage';
import { backoffDelay, sleep, withRetry } from './retry';

const fast = { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 };
const signal = () => new AbortController().signal;

describe('withRetry', () => {
  it('retries transient failures until one succeeds', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(storageError(429, 'TOO_MANY_CONCURRENT_UPLOADS'))
      .mockResolvedValue('ok');

    await expect(withRetry(task, signal(), fast)).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt with the last error', async () => {
    const last = storageError(502, 'UPSTREAM_UNAVAILABLE');
    const task = vi.fn().mockRejectedValueOnce(networkError()).mockRejectedValueOnce(networkError()).mockRejectedValue(last);

    await expect(withRetry(task, signal(), fast)).rejects.toBe(last);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors that another try cannot fix', async () => {
    const task = vi.fn().mockRejectedValue(storageError(400, 'FILE_HASH_MISMATCH'));

    await expect(withRetry(task, signal(), fast)).rejects.toMatchObject({ message: '400 FILE_HASH_MISMATCH' });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('stops waiting as soon as it is aborted', async () => {
    const controller = new AbortController();
    const task = vi.fn().mockRejectedValue(networkError());
    const pending = withRetry(task, controller.signal, { attempts: 5, baseDelayMs: 60_000, maxDelayMs: 60_000 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially up to the cap, scaled by jitter', () => {
    const policy = { attempts: 10, baseDelayMs: 100, maxDelayMs: 1_000 };
    expect([0, 1, 2, 3, 4, 9].map((attempt) => backoffDelay(attempt, policy, () => 1))).toEqual([
      100, 200, 400, 800, 1_000, 1_000,
    ]);
    expect(backoffDelay(3, policy, () => 0.5)).toBe(400);
  });
});

describe('sleep', () => {
  it('rejects right away when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
