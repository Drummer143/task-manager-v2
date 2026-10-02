import type { UploadError, UploadResult } from '../types';
import { type UploadEvent, type UploadMachineState, initialState, transition } from './upload-machine';

const result: UploadResult = {
  asset: { id: 'a', name: 'f', createdAt: '2026-10-02T00:00:00Z' },
  mimeType: 'text/plain',
};
const error: UploadError = { code: 'NETWORK_ERROR', message: 'offline', retryable: true };

const run = (events: UploadEvent[], from = initialState()) => events.reduce(transition, from);

const toChunked: UploadEvent[] = [
  { type: 'START' },
  { type: 'HASHED', hash: 'h' },
  { type: 'INITIALIZED', mode: 'chunked', transactionId: 'tx', chunkSize: 5, maxConcurrentUploads: 3 },
];

describe('upload machine', () => {
  it('walks the chunked happy path', () => {
    const uploading = run(toChunked);
    expect(uploading).toMatchObject({
      status: 'uploading',
      ctx: { hash: 'h', transactionId: 'tx', mode: 'chunked', chunkSize: 5, maxConcurrentUploads: 3 },
    });

    const done = run([{ type: 'UPLOADED' }, { type: 'COMPLETED', result }], uploading);
    expect(done).toMatchObject({ status: 'done', result });
  });

  it('completes a whole-file upload without a completing step', () => {
    const state = run([
      { type: 'START' },
      { type: 'HASHED', hash: 'h' },
      { type: 'INITIALIZED', mode: 'whole-file', transactionId: 'tx' },
    ]);
    expect(transition(state, { type: 'UPLOADED' })).toBe(state);
    expect(transition(state, { type: 'COMPLETED', result }).status).toBe('done');
  });

  it('goes to verifying when the server already has the content', () => {
    const state = run([
      { type: 'START' },
      { type: 'HASHED', hash: 'h' },
      { type: 'INITIALIZED', mode: 'verify', transactionId: 'tx', ranges: [{ start: 0, end: 4 }] },
    ]);
    expect(state).toMatchObject({ status: 'verifying', ctx: { mode: 'verify', ranges: [{ start: 0, end: 4 }] } });
    expect(transition(state, { type: 'COMPLETED', result }).status).toBe('done');
  });

  it('returns the same object for events that do not apply', () => {
    const queued = initialState();
    for (const event of [
      { type: 'HASHED', hash: 'h' },
      { type: 'UPLOADED' },
      { type: 'COMPLETED', result },
      { type: 'RESUME' },
      { type: 'RETRY' },
      { type: 'CANCELLED' },
      { type: 'FAIL', error },
    ] satisfies UploadEvent[]) {
      expect(transition(queued, event)).toBe(queued);
    }
  });

  it('tracks progress only in the step it belongs to', () => {
    const hashing = run([{ type: 'START' }]);
    expect(transition(hashing, { type: 'HASH_PROGRESS', hashedBytes: 7 }).ctx.hashedBytes).toBe(7);
    expect(transition(hashing, { type: 'UPLOAD_PROGRESS', uploadedBytes: 7 })).toBe(hashing);
  });

  describe('pause and resume', () => {
    it('pauses a working step and queues it again on resume, keeping progress', () => {
      const hashing = run([{ type: 'START' }, { type: 'HASH_PROGRESS', hashedBytes: 10 }]);
      const paused = transition(hashing, { type: 'PAUSE' });
      expect(paused).toMatchObject({ status: 'paused', next: 'hashing' });

      const resumed = run([{ type: 'RESUME' }, { type: 'START' }], paused);
      expect(resumed).toMatchObject({ status: 'hashing', ctx: { hashedBytes: 10 } });
    });

    it('pauses a queued upload too', () => {
      expect(transition(initialState(), { type: 'PAUSE' })).toMatchObject({ status: 'paused', next: 'hashing' });
    });

    it('cannot pause what is finished or failed', () => {
      const done = run([...toChunked, { type: 'UPLOADED' }, { type: 'COMPLETED', result }]);
      expect(transition(done, { type: 'PAUSE' })).toBe(done);

      const failed = run([{ type: 'START' }, { type: 'FAIL', error }]);
      expect(transition(failed, { type: 'PAUSE' })).toBe(failed);
    });
  });

  describe('failure and retry', () => {
    it('retries the failed step by default', () => {
      const failed = run([...toChunked, { type: 'FAIL', error }]);
      expect(failed).toMatchObject({ status: 'failed', next: 'uploading', error });
      expect(transition(failed, { type: 'RETRY' })).toMatchObject({ status: 'queued', next: 'uploading' });
    });

    it('failing back to hashing forgets the hash and the transaction', () => {
      const failed = run([...toChunked, { type: 'FAIL', error, next: 'hashing' }]);
      expect(failed).toMatchObject({ status: 'failed', next: 'hashing' });
      expect(failed.ctx).toEqual({ hashedBytes: 0, uploadedBytes: 0 });
    });

    it('failing back to initializing keeps the hash only', () => {
      const failed = run([...toChunked, { type: 'FAIL', error, next: 'initializing' }]);
      expect(failed.ctx).toEqual({ hash: 'h', hashedBytes: 0, uploadedBytes: 0 });
    });

    it('starts a new transaction when the server lost the old one', () => {
      const state = run([...toChunked, { type: 'UPLOAD_PROGRESS', uploadedBytes: 5 }, { type: 'TRANSACTION_LOST' }]);
      expect(state).toMatchObject({ status: 'initializing', ctx: { hash: 'h', uploadedBytes: 0 } });
      expect(state.ctx.transactionId).toBeUndefined();
    });

    it('sends missing chunks again when completing finds them', () => {
      const completing = run([...toChunked, { type: 'UPLOADED' }]);
      expect(transition(completing, { type: 'INCOMPLETE' }).status).toBe('uploading');
    });
  });

  describe('cancel', () => {
    it('cancels at once when the server holds nothing yet', () => {
      expect(transition(run([{ type: 'START' }]), { type: 'CANCEL' }).status).toBe('cancelled');
    });

    it('goes through cancelling when there is a transaction to drop', () => {
      const cancelling = transition(run(toChunked), { type: 'CANCEL' });
      expect(cancelling.status).toBe('cancelling');
      expect(transition(cancelling, { type: 'CANCEL' })).toBe(cancelling);
      expect(transition(cancelling, { type: 'CANCELLED' }).status).toBe('cancelled');
    });

    it('cancels paused and failed uploads', () => {
      const paused: UploadMachineState = transition(run(toChunked), { type: 'PAUSE' });
      expect(transition(paused, { type: 'CANCEL' }).status).toBe('cancelling');

      const failed = run([{ type: 'START' }, { type: 'FAIL', error }]);
      expect(transition(failed, { type: 'CANCEL' }).status).toBe('cancelled');
    });

    it('leaves finished uploads alone', () => {
      const done = run([...toChunked, { type: 'UPLOADED' }, { type: 'COMPLETED', result }]);
      expect(transition(done, { type: 'CANCEL' })).toBe(done);
    });
  });
});
