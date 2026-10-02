/**
 * An in-memory storage-service for tests, following the real one's upload rules: deduplication by
 * hash, chunks of a fixed size with a limit on requests in flight, hash checks, cancellation.
 */
import { readFileSync } from 'node:fs';

import type { UploadInitResponse, UploadStatusResponse, UploadSuccessResponse } from '@task-manager-v2/api/storage/schemas';
import { AxiosError, AxiosHeaders, type AxiosRequestConfig, type AxiosResponse, CanceledError } from 'axios';

import { createBlake3Hasher, loadBlake3 } from '../hasher/blake3';
import type { StorageApi } from '../worker/storage';

export const loadTestHasher = () => loadBlake3(readFileSync(new URL('../hasher/wasm/blake3_bg.wasm', import.meta.url)));

export const blake3Hex = (bytes: Uint8Array): string => {
  const hasher = createBlake3Hasher();
  hasher.update(bytes);
  const hash = hasher.finalize();
  hasher.free();
  return hash;
};

export const storageError = (status: number, code: string, params?: Record<string, unknown>) =>
  new AxiosError(`${status} ${code}`, String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { type: 'about:blank', status, code, ...(params ? { params } : {}) },
  } as AxiosResponse);

export const networkError = () => new AxiosError('Network Error', AxiosError.ERR_NETWORK);

interface Transaction {
  hash: string;
  size: number;
  name: string;
  kind: 'whole-file' | 'chunked' | 'verify';
  bytes: Uint8Array;
  chunks: Set<number>;
  ranges: { start: number; end: number }[];
  /** Chunk requests in flight; like the real server, the limit is per transaction. */
  inFlight: number;
}

type Method = keyof StorageApi;

export interface FakeStorageOptions {
  chunkSize?: number;
  maxConcurrentUploads?: number;
  /** Upload tokens the fake accepts, mapped to the file name they carry. */
  tokens?: Record<string, string>;
}

export class FakeStorage {
  readonly chunkSize: number;
  readonly maxConcurrentUploads: number;
  readonly tokens: Record<string, string>;
  readonly blobs = new Map<string, Uint8Array>();
  readonly transactions = new Map<string, Transaction>();
  readonly calls: { method: Method; transactionId?: string }[] = [];
  /** Highest number of chunk requests in flight at once for one transaction. */
  peakConcurrentChunks = 0;

  private nextId = 0;
  private readonly failures: { method: Method; error: unknown }[] = [];
  private gate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;

  constructor(options: FakeStorageOptions = {}) {
    this.chunkSize = options.chunkSize ?? 16;
    this.maxConcurrentUploads = options.maxConcurrentUploads ?? 2;
    this.tokens = options.tokens ?? { 'token-1': 'file.bin' };
  }

  /** The next call of `method` throws `error` instead. */
  failNext(method: Method, error: unknown): void {
    this.failures.push({ method, error });
  }

  /** Holds chunk requests until {@link release}; they still honour their abort signal. */
  hold(): void {
    this.gate = new Promise((resolve) => (this.openGate = resolve));
  }

  release(): void {
    this.openGate?.();
    this.gate = undefined;
  }

  callsOf(method: Method) {
    return this.calls.filter((call) => call.method === method);
  }

  readonly api: StorageApi = {
    uploadInit: async (dto, options) => {
      this.enter('uploadInit', undefined, options);
      const name = this.tokens[dto.uploadToken];
      if (!name) throw storageError(401, 'UPLOAD_TOKEN_INVALID');

      const transactionId = `tx-${++this.nextId}`;
      const base = { hash: dto.hash, size: dto.size, name, chunks: new Set<number>(), ranges: [], inFlight: 0 };

      if (this.blobs.has(dto.hash)) {
        const ranges = [{ start: 0, end: Math.min(dto.size, 8) }];
        this.transactions.set(transactionId, { ...base, kind: 'verify', bytes: new Uint8Array(), ranges });
        return { nextStep: 'verifyRanges', data: { transactionId, ranges } } satisfies UploadInitResponse;
      }
      const chunked = dto.size > this.chunkSize * 3;
      this.transactions.set(transactionId, {
        ...base,
        kind: chunked ? 'chunked' : 'whole-file',
        bytes: new Uint8Array(dto.size),
      });
      return (
        chunked
          ? {
              nextStep: 'startUploadChunked',
              data: { transactionId, chunkSize: this.chunkSize, maxConcurrentUploads: this.maxConcurrentUploads },
            }
          : { nextStep: 'startUploadWholeFile', data: { transactionId } }
      ) satisfies UploadInitResponse;
    },

    uploadStatus: async (transactionId, options) => {
      const tx = this.enter('uploadStatus', transactionId, options);
      if (tx.kind === 'whole-file') return { currentStep: 'uploadWholeFile' } satisfies UploadStatusResponse;
      if (tx.kind === 'verify') return { currentStep: 'verifyRanges', data: { ranges: tx.ranges } } satisfies UploadStatusResponse;
      const missing = this.missingChunks(tx);
      return (
        missing.length === 0
          ? { currentStep: 'complete' }
          : {
              currentStep: 'uploadChunked',
              data: { missingChunks: missing, chunkSize: this.chunkSize, maxConcurrentUploads: this.maxConcurrentUploads },
            }
      ) satisfies UploadStatusResponse;
    },

    uploadWholeFile: async (transactionId, body, options) => {
      const tx = this.enter('uploadWholeFile', transactionId, options);
      const bytes = new Uint8Array(await body.arrayBuffer());
      options?.onUploadProgress?.({ loaded: bytes.length, bytes: bytes.length, lengthComputable: true });
      if (blake3Hex(bytes) !== tx.hash) throw storageError(400, 'FILE_HASH_MISMATCH');
      return this.store(transactionId, tx, bytes);
    },

    uploadChunk: async (transactionId, body, options) => {
      const tx = this.enter('uploadChunk', transactionId, options);
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(new AxiosHeaders(options?.headers as never).get('Content-Range')));
      if (!range) throw storageError(400, 'MALFORMED_REQUEST');
      const [start, end] = [Number(range[1]), Number(range[2])];
      if (end - start !== body.size || body.size > this.chunkSize) throw storageError(400, 'INVALID_CHUNK_SIZE');

      if (tx.inFlight >= this.maxConcurrentUploads) {
        throw storageError(429, 'TOO_MANY_CONCURRENT_UPLOADS', { max_concurrent: this.maxConcurrentUploads });
      }
      tx.inFlight++;
      this.peakConcurrentChunks = Math.max(this.peakConcurrentChunks, tx.inFlight);
      try {
        options?.onUploadProgress?.({ loaded: Math.floor(body.size / 2), bytes: 0, lengthComputable: true });
        await this.wait(options?.signal as AbortSignal | undefined);
        tx.bytes.set(new Uint8Array(await body.arrayBuffer()), start);
        tx.chunks.add(start / this.chunkSize);
      } finally {
        tx.inFlight--;
      }
    },

    uploadVerify: async (transactionId, dto, options) => {
      const tx = this.enter('uploadVerify', transactionId, options);
      const stored = this.blobs.get(tx.hash) ?? new Uint8Array();
      const matches = tx.ranges.every(({ start, end }, index) => {
        const sent = dto.ranges[index] ?? [];
        return sent.length === end - start && sent.every((byte, offset) => byte === stored[start + offset]);
      });
      this.transactions.delete(transactionId);
      if (!matches) throw storageError(400, 'VERIFICATION_FAILED');
      return this.result(transactionId, tx);
    },

    uploadComplete: async (transactionId, options) => {
      const tx = this.enter('uploadComplete', transactionId, options);
      if (this.missingChunks(tx).length > 0) throw storageError(400, 'UPLOAD_INCOMPLETE');
      if (blake3Hex(tx.bytes) !== tx.hash) {
        this.transactions.delete(transactionId);
        throw storageError(400, 'FILE_HASH_MISMATCH');
      }
      return this.store(transactionId, tx, tx.bytes);
    },

    uploadCancel: async (transactionId, options) => {
      this.enter('uploadCancel', transactionId, options);
      this.transactions.delete(transactionId);
    },
  };

  /** Records the call, applies scripted failures and resolves the transaction. */
  private enter(method: Method, transactionId: string | undefined, options?: AxiosRequestConfig): Transaction {
    this.calls.push({ method, transactionId });
    if ((options?.signal as AbortSignal | undefined)?.aborted) throw new CanceledError();

    const failure = this.failures.findIndex((f) => f.method === method);
    if (failure !== -1) throw this.failures.splice(failure, 1)[0].error;

    if (transactionId === undefined) return undefined as never;
    const tx = this.transactions.get(transactionId);
    if (!tx) throw storageError(404, 'NOT_FOUND');
    return tx;
  }

  private missingChunks(tx: Transaction): number[] {
    const total = Math.ceil(tx.size / this.chunkSize);
    return Array.from({ length: total }, (_, index) => index).filter((index) => !tx.chunks.has(index));
  }

  private store(transactionId: string, tx: Transaction, bytes: Uint8Array): UploadSuccessResponse {
    this.blobs.set(tx.hash, bytes.slice());
    this.transactions.delete(transactionId);
    return this.result(transactionId, tx);
  }

  private result(transactionId: string, tx: Transaction): UploadSuccessResponse {
    return {
      asset: { id: `asset-of-${transactionId}`, name: tx.name, created_at: '2026-10-02T00:00:00Z' },
      mime_type: 'application/octet-stream',
    };
  }

  /** A macrotask, plus the hold when set; rejects like axios when the request is aborted. */
  private wait(signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new CanceledError());
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const done = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      setTimeout(() => (this.gate ? this.gate.then(done) : done()), 0);
    });
  }
}

/** A file of `size` bytes with a recognisable pattern. */
export const makeFile = (size: number, name = 'file.bin', seed = 1): File =>
  new File([Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) % 251)], name);

/** Resolves when `predicate` holds, polling on macrotasks. */
export async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
