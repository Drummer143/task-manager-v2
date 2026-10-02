/**
 * The page side: starts the upload worker and mirrors the state it reports.
 *
 * `getSnapshot` returns the same array until something changes and `subscribe` notifies about
 * every change, so the uploader plugs straight into React's `useSyncExternalStore`.
 */
import { type UploadResult, type UploadSnapshot, isTerminal } from '../types';
import type { FromWorker, ToWorker, WorkerLike } from '../worker/messages';

export interface UploaderOptions {
  /** Origin of storage-service, e.g. `https://storage.example.com`. */
  storageUrl: string;
  /** The signed-in user's access token; `forceRefresh` after the server rejected the last one. */
  getAccessToken: (options: { forceRefresh: boolean }) => Promise<string>;
  /** Uploads running at once; the rest wait in the queue. 2 by default. */
  maxParallelUploads?: number;
  /** For tests; a module worker running `upload.worker.ts` by default. */
  createWorker?: () => WorkerLike;
}

export interface UploadOptions {
  /** Issued by the main service for this file (`entity_id`, name, ...). */
  uploadToken: string;
  /** Your own id for the upload; a random UUID by default. */
  id?: string;
}

export class UploadCancelledError extends Error {
  constructor(readonly uploadId: string) {
    super('The upload was cancelled');
    this.name = 'UploadCancelledError';
  }
}

export interface UploadHandle {
  readonly id: string;
  getSnapshot(): UploadSnapshot | undefined;
  /**
   * Notified about changes of any upload; `getSnapshot` returns the same object while this one is
   * unchanged, which is what `useSyncExternalStore` compares. Returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void;
  pause(): void;
  resume(): void;
  cancel(): void;
  retry(options?: { uploadToken?: string }): void;
  /** Resolves when the upload is done; rejects with {@link UploadCancelledError} when cancelled. */
  finished(): Promise<UploadResult>;
}

const defaultWorker = (): WorkerLike =>
  new Worker(new URL('../worker/upload.worker.ts', import.meta.url), { type: 'module', name: 'uploader' });

export class Uploader {
  private readonly worker: WorkerLike;
  private readonly uploads = new Map<string, UploadSnapshot>();
  private order: string[] = [];
  private list: readonly UploadSnapshot[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly waiters = new Map<string, { resolve: (result: UploadResult) => void; reject: (error: Error) => void }[]>();

  constructor(private readonly options: UploaderOptions) {
    this.worker = (options.createWorker ?? defaultWorker)();
    this.worker.addEventListener('message', (event) => this.receive(event.data));
    this.post({
      type: 'configure',
      storageUrl: options.storageUrl,
      maxParallelUploads: options.maxParallelUploads ?? 2,
    });
  }

  /** Queues `file`; it starts as soon as a slot is free. */
  upload(file: File, { uploadToken, id = crypto.randomUUID() }: UploadOptions): UploadHandle {
    if (!this.uploads.has(id)) {
      // Shown right away; the worker's first snapshot replaces it
      this.update({ id, fileName: file.name, size: file.size, status: 'queued', step: 'hashing', hashedBytes: 0, uploadedBytes: 0 });
      this.post({ type: 'add', id, file, uploadToken });
    }
    return this.handle(id);
  }

  handle(id: string): UploadHandle {
    return {
      id,
      getSnapshot: () => this.uploads.get(id),
      subscribe: (listener) => this.subscribe(listener),
      pause: () => this.pause(id),
      resume: () => this.resume(id),
      cancel: () => this.cancel(id),
      retry: (options) => this.retry(id, options),
      finished: () => this.finished(id),
    };
  }

  /** Every upload, in queue order. */
  getSnapshot = (): readonly UploadSnapshot[] => this.list;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(id: string): UploadSnapshot | undefined {
    return this.uploads.get(id);
  }

  pause(id: string): void {
    this.post({ type: 'pause', id });
  }

  resume(id: string): void {
    this.post({ type: 'resume', id });
  }

  cancel(id: string): void {
    this.post({ type: 'cancel', id });
  }

  retry(id: string, options?: { uploadToken?: string }): void {
    this.post({ type: 'retry', id, uploadToken: options?.uploadToken });
  }

  /** Moves the upload to `index` in the queue. Uploads already running keep running. */
  reorder(id: string, index: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) return;
    this.order.splice(from, 1);
    this.order.splice(Math.max(0, Math.min(index, this.order.length)), 0, id);
    this.publish();
    this.post({ type: 'reorder', id, index });
  }

  /** Forgets the upload, cancelling it first if it has not finished. */
  remove(id: string): void {
    this.post({ type: 'remove', id });
  }

  pauseAll(): void {
    this.post({ type: 'pause-all' });
  }

  resumeAll(): void {
    this.post({ type: 'resume-all' });
  }

  cancelAll(): void {
    this.post({ type: 'cancel-all' });
  }

  finished(id: string): Promise<UploadResult> {
    const current = this.uploads.get(id);
    if (current?.status === 'done' && current.result) return Promise.resolve(current.result);
    if (!current || current.status === 'cancelled') return Promise.reject(new UploadCancelledError(id));

    return new Promise((resolve, reject) => {
      const list = this.waiters.get(id) ?? [];
      list.push({ resolve, reject });
      this.waiters.set(id, list);
    });
  }

  /** Stops the worker; uploads in flight stop too (the server drops them after a while). */
  destroy(): void {
    this.worker.terminate();
    for (const id of this.waiters.keys()) this.settle(id, undefined);
    this.listeners.clear();
  }

  private post(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(message: FromWorker): void {
    switch (message.type) {
      case 'snapshot':
        this.update(message.upload);
        if (isTerminal(message.upload.status)) this.settle(message.upload.id, message.upload);
        return;
      case 'removed':
        this.uploads.delete(message.id);
        this.order = this.order.filter((id) => id !== message.id);
        this.settle(message.id, undefined);
        this.publish();
        return;
      case 'token-request':
        void this.answerToken(message.requestId, message.refresh);
        return;
    }
  }

  private async answerToken(requestId: number, refresh: boolean): Promise<void> {
    try {
      const token = await this.options.getAccessToken({ forceRefresh: refresh });
      this.post({ type: 'token', requestId, token });
    } catch (error) {
      this.post({ type: 'token', requestId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  private update(snapshot: UploadSnapshot): void {
    if (!this.uploads.has(snapshot.id)) this.order.push(snapshot.id);
    this.uploads.set(snapshot.id, snapshot);
    this.publish();
  }

  /** Resolves `finished()` callers; without a `done` snapshot they are rejected as cancelled. */
  private settle(id: string, snapshot: UploadSnapshot | undefined): void {
    const list = this.waiters.get(id);
    if (!list) return;
    this.waiters.delete(id);
    for (const waiter of list) {
      if (snapshot?.status === 'done' && snapshot.result) waiter.resolve(snapshot.result);
      else waiter.reject(new UploadCancelledError(id));
    }
  }

  private publish(): void {
    this.list = this.order.flatMap((id) => {
      const snapshot = this.uploads.get(id);
      return snapshot ? [snapshot] : [];
    });
    for (const listener of this.listeners) listener();
  }
}

export const createUploader = (options: UploaderOptions): Uploader => new Uploader(options);
