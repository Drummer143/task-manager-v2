/**
 * Drives one upload through the state machine.
 *
 * The machine decides what the upload is; the runner does the work of each step and reports the
 * outcome as events. Every step is safe to run again from the start: pausing aborts the step in
 * flight, and resuming re-runs it, asking the server what it already has where that matters.
 */
import { getStatusCode } from '@task-manager-v2/api';
import type { AxiosProgressEvent, AxiosRequestConfig } from 'axios';

import { isAbort, toUploadError } from '../errors';
import type { Hasher } from '../hasher/blake3';
import { FileHashing } from '../hasher/file-hashing';
import {
  type UploadEvent,
  type UploadMachineState,
  initialState,
  isStep,
  transition,
} from '../machine/upload-machine';
import type { UploadSnapshot, UploadStep } from '../types';
import { DEFAULT_RETRY, type RetryPolicy, withRetry } from './retry';
import { type StorageApi, toUploadResult } from './storage';

export interface RunnerDeps {
  api: StorageApi;
  createHasher: () => Hasher;
  /** Resolves once the hasher can be created (the Wasm module is loaded). */
  hasherReady: () => Promise<unknown>;
  /** The server rejected the access token; the next request must get a fresh one. */
  invalidateToken: () => void;
  retry?: RetryPolicy;
}

/** How often in a row a vanished transaction is replaced before giving up. */
const MAX_LOST_TRANSACTIONS = 2;

export class UploadRunner {
  private state: UploadMachineState = initialState();
  private readonly hashing: FileHashing;
  private controller: AbortController | undefined;
  /** The current drive loop; a new one starts only after the previous one has unwound. */
  private running: Promise<void> = Promise.resolve();
  /** The transaction was created in this run, so the server holds nothing for it yet. */
  private freshTransaction = false;
  private lostTransactions = 0;

  constructor(
    readonly id: string,
    readonly file: File,
    private uploadToken: string,
    private readonly deps: RunnerDeps,
    private readonly onChange: (runner: UploadRunner) => void,
  ) {
    this.hashing = new FileHashing(file, deps.createHasher);
  }

  get status() {
    return this.state.status;
  }

  /** Whether the upload occupies one of the host's parallel slots. */
  get isWorking(): boolean {
    return isStep(this.state.status) || this.state.status === 'cancelling';
  }

  get snapshot(): UploadSnapshot {
    const { state } = this;
    const { ctx } = state;
    return {
      id: this.id,
      fileName: this.file.name,
      size: this.file.size,
      status: state.status,
      step: 'next' in state ? state.next : isStep(state.status) ? state.status : undefined,
      mode: ctx.mode,
      hashedBytes: ctx.hashedBytes,
      uploadedBytes: state.status === 'done' ? this.file.size : ctx.uploadedBytes,
      hash: ctx.hash,
      error: state.status === 'failed' ? state.error : undefined,
      result: state.status === 'done' ? state.result : undefined,
    };
  }

  /** Called by the host when the upload is queued and a slot is free. */
  start(): void {
    if (!this.dispatch({ type: 'START' })) return;
    this.running = this.running.then(() => this.drive());
  }

  pause(): void {
    if (this.dispatch({ type: 'PAUSE' })) this.controller?.abort();
  }

  /** Back to the queue; the host starts it when a slot is free. */
  resume(): void {
    this.dispatch({ type: 'RESUME' });
  }

  /** Back to the queue after a failure. A new upload token replaces one the server rejected. */
  retry(uploadToken?: string): void {
    if (this.state.status !== 'failed') return;
    if (uploadToken) this.uploadToken = uploadToken;
    this.lostTransactions = 0;
    this.dispatch({ type: 'RETRY' });
  }

  async cancel(): Promise<void> {
    const transactionId = this.state.ctx.transactionId;
    if (!this.dispatch({ type: 'CANCEL' })) return;

    this.controller?.abort();
    await this.running;
    this.hashing.dispose();

    if (this.state.status !== 'cancelling' || !transactionId) return;
    try {
      // Best effort: an abandoned transaction is cleaned up by the server after a while anyway
      await this.deps.api.uploadCancel(transactionId);
    } catch {
      // Already gone on the server, or unreachable
    }
    this.dispatch({ type: 'CANCELLED' });
  }

  /** Stops whatever runs and frees memory; for an upload the host forgets. */
  dispose(): void {
    this.controller?.abort();
    this.hashing.dispose();
  }

  private dispatch(event: UploadEvent): boolean {
    const next = transition(this.state, event);
    if (next === this.state) return false;
    this.state = next;
    this.onChange(this);
    return true;
  }

  /** Events from a step that was aborted (paused, cancelled) are stale and dropped. */
  private emit(signal: AbortSignal, event: UploadEvent): void {
    if (!signal.aborted) this.dispatch(event);
  }

  private async drive(): Promise<void> {
    while (isStep(this.state.status)) {
      const step = this.state.status;
      const controller = new AbortController();
      this.controller = controller;

      try {
        await this.runStep(step, controller.signal);
      } catch (error) {
        // A pause or cancel took over; the machine already left the step
        if (controller.signal.aborted || isAbort(error)) return;
        this.fail(step, error);
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    }
  }

  private runStep(step: UploadStep, signal: AbortSignal): Promise<void> {
    switch (step) {
      case 'hashing':
        return this.hash(signal);
      case 'initializing':
        return this.initialize(signal);
      case 'uploading':
        return this.state.ctx.mode === 'chunked' ? this.uploadChunks(signal) : this.uploadWholeFile(signal);
      case 'verifying':
        return this.verify(signal);
      case 'completing':
        return this.complete(signal);
    }
  }

  private async hash(signal: AbortSignal): Promise<void> {
    await this.deps.hasherReady();
    const hash = await this.hashing.run(signal, (hashedBytes) =>
      this.emit(signal, { type: 'HASH_PROGRESS', hashedBytes }),
    );
    this.emit(signal, { type: 'HASHED', hash });
  }

  private async initialize(signal: AbortSignal): Promise<void> {
    const hash = this.state.ctx.hash;
    if (!hash) throw new Error('initializing without a hash');

    const response = await this.call(signal, (options) =>
      this.deps.api.uploadInit({ uploadToken: this.uploadToken, hash, size: this.file.size }, options),
    );
    this.freshTransaction = true;

    switch (response.nextStep) {
      case 'startUploadWholeFile':
        this.emit(signal, { type: 'INITIALIZED', mode: 'whole-file', transactionId: response.data.transactionId });
        break;
      case 'startUploadChunked':
        this.emit(signal, {
          type: 'INITIALIZED',
          mode: 'chunked',
          transactionId: response.data.transactionId,
          chunkSize: response.data.chunkSize,
          maxConcurrentUploads: response.data.maxConcurrentUploads,
        });
        break;
      case 'verifyRanges':
        this.emit(signal, {
          type: 'INITIALIZED',
          mode: 'verify',
          transactionId: response.data.transactionId,
          ranges: response.data.ranges,
        });
        break;
    }
  }

  private async uploadWholeFile(signal: AbortSignal): Promise<void> {
    const transactionId = this.transactionId();
    const response = await this.call(signal, (options) =>
      this.deps.api.uploadWholeFile(transactionId, this.file, {
        ...options,
        onUploadProgress: (event: AxiosProgressEvent) =>
          this.emit(signal, { type: 'UPLOAD_PROGRESS', uploadedBytes: event.loaded }),
      }),
    );
    this.emit(signal, { type: 'COMPLETED', result: toUploadResult(response) });
  }

  private async uploadChunks(signal: AbortSignal): Promise<void> {
    const transactionId = this.transactionId();
    const size = this.file.size;
    let { chunkSize = 0, maxConcurrentUploads = 1 } = this.state.ctx;
    let missing: number[];

    if (this.freshTransaction) {
      missing = Array.from({ length: Math.ceil(size / chunkSize) }, (_, index) => index);
    } else {
      // Resumed: the server knows which chunks it already has
      const status = await this.call(signal, (options) => this.deps.api.uploadStatus(transactionId, options));
      if (status.currentStep === 'complete') {
        this.emit(signal, { type: 'UPLOADED' });
        return;
      }
      if (status.currentStep !== 'uploadChunked') throw new TransactionMismatch();
      ({ chunkSize, maxConcurrentUploads } = status.data);
      missing = status.data.missingChunks ?? [];
    }
    this.freshTransaction = false;

    const chunkLength = (index: number) => Math.min(chunkSize, size - index * chunkSize);
    let confirmed = size - missing.reduce((sum, index) => sum + chunkLength(index), 0);
    const inFlight = new Map<number, number>();
    const report = () => {
      let uploadedBytes = confirmed;
      for (const loaded of inFlight.values()) uploadedBytes += loaded;
      this.emit(signal, { type: 'UPLOAD_PROGRESS', uploadedBytes });
    };
    report();

    // One failed chunk stops its siblings too
    const pool = new AbortController();
    const stop = () => pool.abort();
    signal.addEventListener('abort', stop, { once: true });
    const queue = [...missing];

    const lane = async () => {
      for (let index = queue.shift(); index !== undefined; index = queue.shift()) {
        const start = index * chunkSize;
        const chunk = this.file.slice(start, start + chunkLength(index));
        const chunkIndex = index;

        await this.call(pool.signal, (options) =>
          this.deps.api.uploadChunk(transactionId, chunk, {
            ...options,
            // storage reads the end as exclusive (end - start = chunk length), unlike RFC 9110
            headers: { 'Content-Range': `bytes ${start}-${start + chunk.size}/${size}` },
            onUploadProgress: (event: AxiosProgressEvent) => {
              inFlight.set(chunkIndex, event.loaded);
              report();
            },
          }),
        );
        inFlight.delete(chunkIndex);
        confirmed += chunk.size;
        report();
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.max(1, Math.min(maxConcurrentUploads, queue.length)) }, () =>
          lane().catch((error: unknown) => {
            stop();
            throw error;
          }),
        ),
      );
    } finally {
      signal.removeEventListener('abort', stop);
    }

    this.emit(signal, { type: 'UPLOADED' });
  }

  private async verify(signal: AbortSignal): Promise<void> {
    const transactionId = this.transactionId();
    const ranges = await Promise.all(
      (this.state.ctx.ranges ?? []).map(async ({ start, end }) =>
        // storage takes each range as an array of byte values
        Array.from(new Uint8Array(await this.file.slice(start, end).arrayBuffer())),
      ),
    );
    const response = await this.call(signal, (options) =>
      this.deps.api.uploadVerify(transactionId, { ranges }, options),
    );
    this.emit(signal, { type: 'COMPLETED', result: toUploadResult(response) });
  }

  private async complete(signal: AbortSignal): Promise<void> {
    const transactionId = this.transactionId();
    try {
      const response = await this.call(signal, (options) => this.deps.api.uploadComplete(transactionId, options));
      this.emit(signal, { type: 'COMPLETED', result: toUploadResult(response) });
    } catch (error) {
      if (toUploadError(error).code !== 'UPLOAD_INCOMPLETE') throw error;
      this.emit(signal, { type: 'INCOMPLETE' });
    }
  }

  /** Decides where a failed step leads. */
  private fail(step: UploadStep, error: unknown): void {
    const uploadError = toUploadError(error);
    const transactionLost =
      error instanceof TransactionMismatch ||
      uploadError.code === 'NOT_FOUND' ||
      uploadError.code === 'UPLOAD_WRONG_STEP';

    if (transactionLost && step !== 'initializing' && this.lostTransactions < MAX_LOST_TRANSACTIONS) {
      // Expired on the server (unfinished uploads live a few days) or out of step with it:
      // start a new transaction. The hash is known, so only the upload itself is repeated.
      this.lostTransactions++;
      this.dispatch({ type: 'TRANSACTION_LOST' });
      return;
    }

    switch (uploadError.code) {
      // The content does not match its hash: the file changed after it was hashed
      case 'FILE_HASH_MISMATCH':
      case 'VERIFICATION_FAILED':
        this.hashing.dispose();
        this.dispatch({ type: 'FAIL', error: uploadError, next: 'hashing' });
        return;
      // A retry needs a new transaction, typically with a new upload token
      case 'UPLOAD_TOKEN_INVALID':
        this.dispatch({ type: 'FAIL', error: uploadError, next: 'initializing' });
        return;
      default:
        this.dispatch({ type: 'FAIL', error: uploadError });
    }
  }

  /** One storage call: transient failures are retried, a rejected access token is renewed once. */
  private call<T>(signal: AbortSignal, request: (options: AxiosRequestConfig) => Promise<T>): Promise<T> {
    return withRetry(
      async () => {
        try {
          return await request({ signal });
        } catch (error) {
          if (getStatusCode(error) !== 401) throw error;
          this.deps.invalidateToken();
          return request({ signal });
        }
      },
      signal,
      this.deps.retry ?? DEFAULT_RETRY,
    );
  }

  private transactionId(): string {
    const { transactionId } = this.state.ctx;
    if (!transactionId) throw new Error(`${this.state.status} without a transaction`);
    return transactionId;
  }
}

/** The server's view of the transaction does not match the step the upload is in. */
class TransactionMismatch extends Error {
  constructor() {
    super('The server is at another step of this upload');
  }
}
