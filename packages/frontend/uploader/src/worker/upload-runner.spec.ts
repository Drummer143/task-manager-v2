import { createBlake3Hasher } from '../hasher/blake3';
import { FakeStorage, blake3Hex, loadTestHasher, makeFile, networkError, storageError, until } from '../testing/fake-storage';
import type { UploadStatus } from '../types';
import { UploadRunner } from './upload-runner';

beforeAll(() => loadTestHasher());

const fastRetry = { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 };

function setup(file: File, storage = new FakeStorage(), token = 'token-1') {
  const statuses: UploadStatus[] = [];
  const invalidateToken = vi.fn();
  const runner = new UploadRunner(
    'upload-1',
    file,
    token,
    { api: storage.api, createHasher: createBlake3Hasher, hasherReady: loadTestHasher, invalidateToken, retry: fastRetry },
    (changed) => {
      if (statuses.at(-1) !== changed.status) statuses.push(changed.status);
    },
  );
  const settled = () => until(() => ['done', 'failed', 'cancelled', 'paused'].includes(runner.status));
  return { runner, storage, statuses, invalidateToken, settled };
}

const contentOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

describe('UploadRunner', () => {
  it('uploads a small file in one request', async () => {
    const file = makeFile(40);
    const { runner, storage, statuses, settled } = setup(file);

    runner.start();
    await settled();

    expect(statuses).toEqual(['hashing', 'initializing', 'uploading', 'done']);
    expect(runner.snapshot).toMatchObject({
      status: 'done',
      mode: 'whole-file',
      uploadedBytes: 40,
      hashedBytes: 40,
      hash: blake3Hex(await contentOf(file)),
      result: { asset: { name: 'file.bin' }, mimeType: 'application/octet-stream' },
    });
    expect(storage.calls.map((call) => call.method)).toEqual(['uploadInit', 'uploadWholeFile']);
  });

  it('uploads a large file in chunks, never exceeding the allowed parallelism', async () => {
    const file = makeFile(100);
    const { runner, storage, statuses, settled } = setup(file, new FakeStorage({ chunkSize: 16, maxConcurrentUploads: 2 }));

    runner.start();
    await settled();

    expect(statuses).toEqual(['hashing', 'initializing', 'uploading', 'completing', 'done']);
    expect(storage.callsOf('uploadChunk')).toHaveLength(7);
    expect(storage.peakConcurrentChunks).toBe(2);
    expect(storage.blobs.get(runner.snapshot.hash ?? '')).toEqual(await contentOf(file));
  });

  it('only proves possession when the server already has the content', async () => {
    const file = makeFile(100);
    const storage = new FakeStorage();
    storage.blobs.set(blake3Hex(await contentOf(file)), await contentOf(file));
    const { runner, statuses, settled } = setup(file, storage);

    runner.start();
    await settled();

    expect(statuses).toEqual(['hashing', 'initializing', 'verifying', 'done']);
    expect(runner.snapshot.mode).toBe('verify');
    expect(storage.callsOf('uploadChunk')).toHaveLength(0);
  });

  describe('pause and resume', () => {
    it('continues a chunked upload with the chunks the server is missing', async () => {
      const file = makeFile(100);
      const { runner, storage, settled } = setup(file);
      storage.hold();

      runner.start();
      await until(() => storage.callsOf('uploadChunk').length === 2);
      runner.pause();
      await settled();
      expect(runner.snapshot).toMatchObject({ status: 'paused', step: 'uploading' });

      storage.release();
      runner.resume();
      runner.start();
      await settled();

      expect(runner.status).toBe('done');
      expect(storage.callsOf('uploadStatus')).toHaveLength(1);
      // The two aborted chunks went again, nothing else twice
      expect(storage.callsOf('uploadChunk')).toHaveLength(9);
      expect(storage.blobs.get(runner.snapshot.hash ?? '')).toEqual(await contentOf(file));
    });

    it('starts a new transaction when the old one expired while paused', async () => {
      const file = makeFile(100);
      const { runner, storage, settled } = setup(file);
      storage.hold();

      runner.start();
      await until(() => storage.callsOf('uploadChunk').length > 0);
      runner.pause();
      await settled();
      storage.transactions.clear();
      storage.release();

      runner.resume();
      runner.start();
      await settled();

      expect(runner.status).toBe('done');
      expect(storage.callsOf('uploadInit')).toHaveLength(2);
    });
  });

  describe('cancel', () => {
    it('drops the transaction on the server', async () => {
      const { runner, storage, settled } = setup(makeFile(100));
      storage.hold();

      runner.start();
      await until(() => storage.callsOf('uploadChunk').length > 0);
      await runner.cancel();
      await settled();

      expect(runner.status).toBe('cancelled');
      expect(storage.callsOf('uploadCancel')).toHaveLength(1);
      expect(storage.transactions.size).toBe(0);
    });

    it('needs no server call before a transaction exists', async () => {
      const { runner, storage } = setup(makeFile(100));

      await runner.cancel();

      expect(runner.status).toBe('cancelled');
      expect(storage.calls).toHaveLength(0);
    });
  });

  describe('errors', () => {
    it('retries transient failures without failing the upload', async () => {
      const storage = new FakeStorage();
      storage.failNext('uploadChunk', networkError());
      storage.failNext('uploadComplete', storageError(502, 'UPSTREAM_UNAVAILABLE'));
      const { runner, settled } = setup(makeFile(100), storage);

      runner.start();
      await settled();

      expect(runner.status).toBe('done');
    });

    it('fails after retries run out and continues from the same step on retry', async () => {
      const storage = new FakeStorage();
      for (let i = 0; i < 3; i++) storage.failNext('uploadInit', networkError());
      const { runner, settled } = setup(makeFile(40), storage);

      runner.start();
      await settled();
      expect(runner.snapshot).toMatchObject({
        status: 'failed',
        step: 'initializing',
        error: { code: 'NETWORK_ERROR', retryable: true },
      });

      runner.retry();
      runner.start();
      await settled();
      expect(runner.status).toBe('done');
    });

    it('fails on a rejected upload token; a retry can bring a new one', async () => {
      const { runner, settled } = setup(makeFile(40), new FakeStorage({ tokens: { fresh: 'file.bin' } }), 'stale');

      runner.start();
      await settled();
      expect(runner.snapshot).toMatchObject({ status: 'failed', step: 'initializing', error: { code: 'UPLOAD_TOKEN_INVALID' } });

      runner.retry('fresh');
      runner.start();
      await settled();
      expect(runner.status).toBe('done');
    });

    it('renews a rejected access token once and repeats the request', async () => {
      const storage = new FakeStorage();
      storage.failNext('uploadInit', storageError(401, 'UNAUTHORIZED'));
      const { runner, invalidateToken, settled } = setup(makeFile(40), storage);

      runner.start();
      await settled();

      expect(invalidateToken).toHaveBeenCalledTimes(1);
      expect(runner.status).toBe('done');
    });

    it('hashes again when the content no longer matches its hash', async () => {
      const storage = new FakeStorage();
      storage.failNext('uploadComplete', storageError(400, 'FILE_HASH_MISMATCH'));
      const { runner, settled } = setup(makeFile(100), storage);

      runner.start();
      await settled();
      expect(runner.snapshot).toMatchObject({ status: 'failed', step: 'hashing', hashedBytes: 0 });
      expect(runner.snapshot.hash).toBeUndefined();

      runner.retry();
      runner.start();
      await settled();
      expect(runner.status).toBe('done');
    });

    it('sends missing chunks again when completing finds the upload incomplete', async () => {
      const storage = new FakeStorage();
      storage.failNext('uploadComplete', storageError(400, 'UPLOAD_INCOMPLETE'));
      const { runner, statuses, settled } = setup(makeFile(100), storage);

      runner.start();
      await settled();

      expect(statuses).toEqual(['hashing', 'initializing', 'uploading', 'completing', 'uploading', 'completing', 'done']);
      expect(storage.callsOf('uploadStatus')).toHaveLength(1);
    });

    it('reports a non-retryable server error as is', async () => {
      const storage = new FakeStorage();
      storage.failNext('uploadWholeFile', storageError(413, 'FILE_TOO_LARGE', { max_bytes: 1, actual_bytes: 40 }));
      const { runner, settled } = setup(makeFile(40), storage);

      runner.start();
      await settled();

      expect(runner.snapshot).toMatchObject({
        status: 'failed',
        step: 'uploading',
        error: { code: 'FILE_TOO_LARGE', status: 413, params: { max_bytes: 1, actual_bytes: 40 }, retryable: false },
      });
    });
  });
});
