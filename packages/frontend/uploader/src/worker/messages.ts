/** What the page and the upload worker say to each other. Everything here is structured-cloneable. */
import type { UploadSnapshot } from '../types';

export type ToWorker =
  | { type: 'configure'; storageUrl: string; maxParallelUploads: number }
  | { type: 'add'; id: string; file: File; uploadToken: string }
  | { type: 'pause'; id: string }
  | { type: 'resume'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string; uploadToken?: string }
  /** Forgets the upload, cancelling it first if it has not finished. */
  | { type: 'remove'; id: string }
  /** Moves the upload to `index` in the queue; uploads already running keep running. */
  | { type: 'reorder'; id: string; index: number }
  | { type: 'pause-all' }
  | { type: 'resume-all' }
  | { type: 'cancel-all' }
  | { type: 'token'; requestId: number; token?: string; error?: string };

export type FromWorker =
  | { type: 'snapshot'; upload: UploadSnapshot }
  | { type: 'removed'; id: string }
  /** The worker needs an access token; `refresh` after the server rejected the previous one. */
  | { type: 'token-request'; requestId: number; refresh: boolean };

/** The side of a `Worker` the worker sees (its global scope), narrowed to what is used. */
export interface WorkerScope {
  postMessage(message: FromWorker): void;
  addEventListener(type: 'message', listener: (event: { data: ToWorker }) => void): void;
}

/** The side of a `Worker` the page sees. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  addEventListener(type: 'message', listener: (event: { data: FromWorker }) => void): void;
  terminate(): void;
}
