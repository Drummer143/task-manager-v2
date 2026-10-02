import { createBlake3Hasher } from '../hasher/blake3';
import { FakeStorage, loadTestHasher, makeFile, storageError, until } from '../testing/fake-storage';
import type { FromWorker, ToWorker, WorkerLike, WorkerScope } from '../worker/messages';
import { UploadHost } from '../worker/upload-host';
import { UploadCancelledError, Uploader } from './uploader';

beforeAll(() => loadTestHasher());

/**
 * Browsers clone a File with its name; Node turns it into a nameless Blob, so files pass as they
 * are and the rest of the message is cloned.
 */
const clone = <T>(message: T): T =>
  message && typeof message === 'object' && 'file' in message
    ? { ...structuredClone({ ...message, file: undefined }), file: message.file }
    : structuredClone(message);

/** Page and worker in one process; messages are cloned and delivered asynchronously, as for real. */
function connect(storage: FakeStorage) {
  const toPage: ((event: { data: FromWorker }) => void)[] = [];
  const toWorker: ((event: { data: ToWorker }) => void)[] = [];
  const deliver = <T>(listeners: ((event: { data: T }) => void)[], message: T) =>
    setTimeout(() => listeners.forEach((listener) => listener({ data: clone(message) })), 0);

  const scope: WorkerScope = {
    postMessage: (message) => deliver(toPage, message),
    addEventListener: (_type, listener) => toWorker.push(listener),
  };
  const configureApi = vi.fn();
  const host = new UploadHost(scope, {
    api: storage.api,
    createHasher: createBlake3Hasher,
    hasherReady: loadTestHasher,
    configureApi,
    retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
  });

  const worker: WorkerLike = {
    postMessage: (message) => deliver(toWorker, message),
    addEventListener: (_type, listener) => toPage.push(listener),
    terminate: vi.fn(),
  };
  return { host, worker, configureApi };
}

function setup(options: { maxParallelUploads?: number; storage?: FakeStorage } = {}) {
  const storage = options.storage ?? new FakeStorage({ tokens: { 'token-1': 'file.bin', 'token-2': 'other.bin' } });
  const { worker, configureApi } = connect(storage);
  const getAccessToken = vi.fn(async ({ forceRefresh }: { forceRefresh: boolean }) => (forceRefresh ? 'renewed' : 'access'));
  const uploader = new Uploader({
    storageUrl: 'https://storage.test',
    getAccessToken,
    maxParallelUploads: options.maxParallelUploads,
    createWorker: () => worker,
  });
  return { uploader, storage, worker, configureApi, getAccessToken };
}

describe('Uploader', () => {
  it('uploads and resolves finished() with the asset', async () => {
    const { uploader } = setup();

    const upload = uploader.upload(makeFile(100), { uploadToken: 'token-1', id: 'u1' });
    expect(upload.getSnapshot()).toMatchObject({ id: 'u1', status: 'queued', fileName: 'file.bin', size: 100 });

    await expect(upload.finished()).resolves.toMatchObject({ asset: { name: 'file.bin' } });
    expect(uploader.get('u1')).toMatchObject({ status: 'done', uploadedBytes: 100 });
  });

  it('configures the storage client and answers its token requests', async () => {
    const { uploader, configureApi, getAccessToken } = setup();
    await until(() => configureApi.mock.calls.length > 0);

    const { baseUrl, getAccessToken: workerToken } = configureApi.mock.calls[0][0];
    expect(baseUrl).toBe('https://storage.test');
    await expect(workerToken()).resolves.toBe('access');
    // Kept until the server rejects it
    await expect(workerToken()).resolves.toBe('access');
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    uploader.destroy();
  });

  it('runs at most maxParallelUploads at once and starts the rest in queue order', async () => {
    const { uploader, storage } = setup({ maxParallelUploads: 1 });
    storage.hold();
    const order: string[] = [];
    uploader.subscribe(() => {
      for (const upload of uploader.getSnapshot()) {
        if (upload.status === 'hashing' && !order.includes(upload.id)) order.push(upload.id);
      }
    });

    uploader.upload(makeFile(100, 'a.bin', 1), { uploadToken: 'token-1', id: 'a' });
    uploader.upload(makeFile(100, 'b.bin', 2), { uploadToken: 'token-1', id: 'b' });
    uploader.upload(makeFile(100, 'c.bin', 3), { uploadToken: 'token-1', id: 'c' });
    uploader.reorder('c', 1);
    expect(uploader.getSnapshot().map((upload) => upload.id)).toEqual(['a', 'c', 'b']);

    await until(() => uploader.get('a')?.status === 'uploading');
    expect(uploader.getSnapshot().map((upload) => upload.status)).toEqual(['uploading', 'queued', 'queued']);

    storage.release();
    await Promise.all(['a', 'b', 'c'].map((id) => uploader.handle(id).finished()));
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('pauses, resumes and cancels through the handle', async () => {
    const { uploader, storage } = setup();
    storage.hold();
    const upload = uploader.upload(makeFile(100), { uploadToken: 'token-1', id: 'u1' });

    await until(() => storage.callsOf('uploadChunk').length > 0);
    upload.pause();
    await until(() => upload.getSnapshot()?.status === 'paused');

    storage.release();
    upload.resume();
    await expect(upload.finished()).resolves.toBeDefined();

    const second = uploader.upload(makeFile(100, 'other.bin', 9), { uploadToken: 'token-2', id: 'u2' });
    storage.hold();
    await until(() => second.getSnapshot()?.status === 'uploading');
    second.cancel();
    await expect(second.finished()).rejects.toBeInstanceOf(UploadCancelledError);
    expect(storage.transactions.size).toBe(0);
  });

  it('keeps a failed upload until it is retried', async () => {
    const storage = new FakeStorage();
    storage.failNext('uploadWholeFile', storageError(400, 'FILE_SIZE_MISMATCH'));
    const { uploader } = setup({ storage });
    const upload = uploader.upload(makeFile(40), { uploadToken: 'token-1', id: 'u1' });

    await until(() => upload.getSnapshot()?.status === 'failed');
    expect(upload.getSnapshot()?.error?.code).toBe('FILE_SIZE_MISMATCH');

    upload.retry();
    await expect(upload.finished()).resolves.toBeDefined();
  });

  it('forgets removed uploads and rejects their waiters', async () => {
    const { uploader, storage } = setup();
    storage.hold();
    const upload = uploader.upload(makeFile(100), { uploadToken: 'token-1', id: 'u1' });
    const finished = upload.finished();

    uploader.remove('u1');

    await expect(finished).rejects.toBeInstanceOf(UploadCancelledError);
    await until(() => uploader.getSnapshot().length === 0);
    expect(uploader.get('u1')).toBeUndefined();
  });

  it('keeps getSnapshot stable between changes, for useSyncExternalStore', async () => {
    const { uploader } = setup();
    const before = uploader.getSnapshot();
    expect(uploader.getSnapshot()).toBe(before);

    uploader.upload(makeFile(40), { uploadToken: 'token-1' });
    expect(uploader.getSnapshot()).not.toBe(before);
    expect(uploader.getSnapshot()).toBe(uploader.getSnapshot());
    await uploader.handle(uploader.getSnapshot()[0].id).finished();
  });

  it('pauses and resumes everything at once', async () => {
    const { uploader, storage } = setup({ maxParallelUploads: 2 });
    storage.hold();
    uploader.upload(makeFile(100, 'a.bin', 1), { uploadToken: 'token-1', id: 'a' });
    uploader.upload(makeFile(100, 'b.bin', 2), { uploadToken: 'token-1', id: 'b' });
    uploader.upload(makeFile(100, 'c.bin', 3), { uploadToken: 'token-1', id: 'c' });
    await until(() => uploader.get('a')?.status === 'uploading');

    uploader.pauseAll();
    await until(() => uploader.getSnapshot().every((upload) => upload.status === 'paused'));

    storage.release();
    uploader.resumeAll();
    await Promise.all(['a', 'b', 'c'].map((id) => uploader.handle(id).finished()));
  });
});
