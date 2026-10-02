/**
 * The upload state machine: a pure function from (state, event) to the next state.
 *
 * It owns what the upload *is* (its status and what is known about it). What the upload *does*
 * in each status (hashing, HTTP calls) lives in the runner, which reports back through events.
 * An event that does not apply to the current status returns the very same state object, so
 * callers can tell "ignored" apart with `===`.
 *
 *   queued ──START──▶ hashing ──HASHED──▶ initializing ──INITIALIZED──▶ uploading ──UPLOADED──▶ completing
 *                                                    └──(server has the content)──▶ verifying
 *   uploading (whole file) / verifying / completing ──COMPLETED──▶ done
 *
 *   any working status ──PAUSE──▶ paused ──RESUME──▶ queued (continues with the same step)
 *   any working status ──FAIL───▶ failed ──RETRY───▶ queued
 *   any non-final status ──CANCEL──▶ cancelling ──CANCELLED──▶ cancelled (straight to cancelled
 *   when the server has nothing to drop yet)
 */
import type { UploadError, UploadMode, UploadResult, UploadStep } from '../types';

export interface ByteRange {
  start: number;
  /** Exclusive. */
  end: number;
}

/** What is known about the upload so far. */
export interface UploadContext {
  hash?: string;
  transactionId?: string;
  mode?: UploadMode;
  /** Chunked mode: bytes per chunk and how many may be in flight, as the server dictates. */
  chunkSize?: number;
  maxConcurrentUploads?: number;
  /** Verify mode: the ranges the server asked for. */
  ranges?: ByteRange[];
  hashedBytes: number;
  uploadedBytes: number;
}

export type UploadPhase =
  | { status: 'queued'; next: UploadStep }
  | { status: UploadStep }
  | { status: 'paused'; next: UploadStep }
  | { status: 'failed'; next: UploadStep; error: UploadError }
  | { status: 'cancelling' }
  | { status: 'cancelled' }
  | { status: 'done'; result: UploadResult };

export type UploadMachineState = UploadPhase & { ctx: UploadContext };

export type InitializedEvent =
  | { type: 'INITIALIZED'; transactionId: string; mode: 'whole-file' }
  | {
      type: 'INITIALIZED';
      transactionId: string;
      mode: 'chunked';
      chunkSize: number;
      maxConcurrentUploads: number;
    }
  | { type: 'INITIALIZED'; transactionId: string; mode: 'verify'; ranges: ByteRange[] };

export type UploadEvent =
  | { type: 'START' }
  | { type: 'HASH_PROGRESS'; hashedBytes: number }
  | { type: 'HASHED'; hash: string }
  | InitializedEvent
  | { type: 'UPLOAD_PROGRESS'; uploadedBytes: number }
  /** Every chunk is on the server. */
  | { type: 'UPLOADED' }
  /** Completing found chunks missing on the server; they are sent again. */
  | { type: 'INCOMPLETE' }
  | { type: 'COMPLETED'; result: UploadResult }
  /** The server no longer knows the transaction (expired or dropped); a new one is started. */
  | { type: 'TRANSACTION_LOST' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  /** `next` is the step a retry continues with; the current step by default. */
  | { type: 'FAIL'; error: UploadError; next?: UploadStep }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'CANCELLED' };

const STEPS: readonly UploadStep[] = ['hashing', 'initializing', 'uploading', 'verifying', 'completing'];

export const isStep = (status: string): status is UploadStep =>
  (STEPS as readonly string[]).includes(status);

export const initialState = (): UploadMachineState => ({
  status: 'queued',
  next: 'hashing',
  ctx: { hashedBytes: 0, uploadedBytes: 0 },
});

/** Context for going back to `step`: whatever that step and the later ones produce is forgotten. */
function contextFor(step: UploadStep, ctx: UploadContext): UploadContext {
  switch (step) {
    case 'hashing':
      return { hashedBytes: 0, uploadedBytes: 0 };
    case 'initializing':
      return { hash: ctx.hash, hashedBytes: ctx.hashedBytes, uploadedBytes: 0 };
    default:
      return ctx;
  }
}

export function transition(state: UploadMachineState, event: UploadEvent): UploadMachineState {
  const { ctx } = state;

  switch (event.type) {
    // Context is kept: a resumed step continues with what it had (e.g. hashing progress)
    case 'START':
      return state.status === 'queued' ? { status: state.next, ctx } : state;

    case 'HASH_PROGRESS':
      return state.status === 'hashing'
        ? { ...state, ctx: { ...ctx, hashedBytes: event.hashedBytes } }
        : state;

    case 'HASHED':
      return state.status === 'hashing'
        ? { status: 'initializing', ctx: { ...ctx, hash: event.hash } }
        : state;

    case 'INITIALIZED': {
      if (state.status !== 'initializing') return state;
      const base = { ...ctx, transactionId: event.transactionId, mode: event.mode, uploadedBytes: 0 };
      switch (event.mode) {
        case 'whole-file':
          return { status: 'uploading', ctx: base };
        case 'chunked':
          return {
            status: 'uploading',
            ctx: { ...base, chunkSize: event.chunkSize, maxConcurrentUploads: event.maxConcurrentUploads },
          };
        case 'verify':
          return { status: 'verifying', ctx: { ...base, ranges: event.ranges } };
      }
      return state;
    }

    case 'UPLOAD_PROGRESS':
      return state.status === 'uploading'
        ? { ...state, ctx: { ...ctx, uploadedBytes: event.uploadedBytes } }
        : state;

    case 'UPLOADED':
      return state.status === 'uploading' && ctx.mode === 'chunked'
        ? { status: 'completing', ctx }
        : state;

    case 'INCOMPLETE':
      return state.status === 'completing' ? { status: 'uploading', ctx } : state;

    case 'COMPLETED':
      return state.status === 'uploading' ||
        state.status === 'verifying' ||
        state.status === 'completing'
        ? { status: 'done', result: event.result, ctx }
        : state;

    case 'TRANSACTION_LOST':
      return state.status === 'uploading' ||
        state.status === 'verifying' ||
        state.status === 'completing'
        ? { status: 'initializing', ctx: contextFor('initializing', ctx) }
        : state;

    case 'PAUSE':
      if (state.status === 'queued') return { status: 'paused', next: state.next, ctx };
      return isStep(state.status) ? { status: 'paused', next: state.status, ctx } : state;

    case 'RESUME':
      return state.status === 'paused' ? { status: 'queued', next: state.next, ctx } : state;

    // Failing back to an earlier step forgets what that step will produce again
    case 'FAIL':
      return isStep(state.status)
        ? {
            status: 'failed',
            next: event.next ?? state.status,
            error: event.error,
            ctx: event.next ? contextFor(event.next, ctx) : ctx,
          }
        : state;

    case 'RETRY':
      return state.status === 'failed' ? { status: 'queued', next: state.next, ctx } : state;

    case 'CANCEL':
      if (state.status === 'done' || state.status === 'cancelled' || state.status === 'cancelling') {
        return state;
      }
      // Without a transaction the server holds nothing for this upload
      return ctx.transactionId ? { status: 'cancelling', ctx } : { status: 'cancelled', ctx };

    case 'CANCELLED':
      return state.status === 'cancelling' ? { status: 'cancelled', ctx } : state;
  }
}
