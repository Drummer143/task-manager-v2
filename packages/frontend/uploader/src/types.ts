/** Public types of the uploader. Everything here crosses the worker boundary, so it is plain data. */

/** The stages an upload goes through, in order. */
export type UploadStep = 'hashing' | 'initializing' | 'uploading' | 'verifying' | 'completing';

/**
 * - `queued`: waiting for a free slot (see `maxParallelUploads`), also after resume and retry;
 * - a {@link UploadStep}: working on it;
 * - `paused`: stopped by the caller; nothing is lost, `resume` continues from the same step;
 * - `failed`: stopped by an error that automatic retries could not get past; `retry` continues;
 * - `cancelling` → `cancelled`: the server-side upload is being dropped;
 * - `done`: the file is stored and the asset created.
 */
export type UploadStatus =
  | 'queued'
  | UploadStep
  | 'paused'
  | 'failed'
  | 'cancelling'
  | 'cancelled'
  | 'done';

/** How storage receives the bytes; decided by the server when the upload starts. */
export type UploadMode =
  /** One request with the whole file (small files). */
  | 'whole-file'
  /** Fixed-size chunks, several in parallel. */
  | 'chunked'
  /** The server already has this content: only sampled ranges are sent to prove possession. */
  | 'verify';

export interface UploadError {
  /**
   * A storage error code (`UPLOAD_TOKEN_INVALID`, `FILE_HASH_MISMATCH`, ...) or one of the
   * uploader's own: `NETWORK_ERROR`, `FILE_UNREADABLE`, `UNEXPECTED_RESPONSE`, `INTERNAL`.
   */
  code: string;
  message: string;
  /** HTTP status, when the error came from the server. */
  status?: number;
  params?: Record<string, unknown>;
  /** Correlation id to quote when reporting a problem. */
  traceId?: string;
  /** Whether retrying the same input can help (a network glitch can, a too large file cannot). */
  retryable: boolean;
}

export interface UploadedAsset {
  id: string;
  name: string;
  createdAt: string;
}

export interface UploadResult {
  asset: UploadedAsset;
  mimeType: string;
}

export interface UploadSnapshot {
  id: string;
  fileName: string;
  /** File size in bytes. */
  size: number;
  status: UploadStatus;
  /** For `paused`, `queued` and `failed`: the step the upload continues with. */
  step?: UploadStep;
  mode?: UploadMode;
  hashedBytes: number;
  /** Bytes the server has acknowledged (for `verify`, the file counts as sent once proven). */
  uploadedBytes: number;
  /** BLAKE3 of the content, lowercase hex, once hashing is done. */
  hash?: string;
  error?: UploadError;
  result?: UploadResult;
}

export const isTerminal = (status: UploadStatus): boolean =>
  status === 'done' || status === 'cancelled';
