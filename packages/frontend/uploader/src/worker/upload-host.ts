/**
 * The worker side: keeps the uploads in queue order, runs up to `maxParallelUploads` of them at a
 * time and reports every change to the page.
 */
import { configureStorage } from '@task-manager-v2/api';

import { createBlake3Hasher, loadBlake3 } from '../hasher/blake3';
import type { FromWorker, ToWorker, WorkerScope } from './messages';
import { generatedStorageApi } from './storage';
import { type RunnerDeps, UploadRunner } from './upload-runner';

/** Progress-only snapshots are sent at most this often per upload; status changes go at once. */
export const PROGRESS_INTERVAL_MS = 100;

export interface HostDeps extends Omit<RunnerDeps, 'invalidateToken'> {
  /** Points the storage client at the server; called on `configure`. */
  configureApi: (config: { baseUrl: string; getAccessToken: () => Promise<string> }) => void;
}

export const defaultHostDeps = (): HostDeps => ({
  api: generatedStorageApi,
  createHasher: createBlake3Hasher,
  hasherReady: () => loadBlake3(),
  configureApi: configureStorage,
});

/** The access token, asked from the page when missing and kept until the server rejects it. */
class TokenSource {
  private token: string | undefined;
  private pending: Promise<string> | undefined;
  private stale = false;
  private nextRequestId = 0;
  private readonly waiting = new Map<number, { resolve: (token: string) => void; reject: (error: Error) => void }>();

  constructor(private readonly post: (message: FromWorker) => void) {}

  get(): Promise<string> {
    if (this.token) return Promise.resolve(this.token);
    return (this.pending ??= this.request().finally(() => (this.pending = undefined)));
  }

  invalidate(): void {
    this.token = undefined;
    this.stale = true;
  }

  receive(message: Extract<ToWorker, { type: 'token' }>): void {
    const waiter = this.waiting.get(message.requestId);
    if (!waiter) return;
    this.waiting.delete(message.requestId);
    if (message.token) {
      this.token = message.token;
      waiter.resolve(message.token);
    } else {
      waiter.reject(new Error(message.error ?? 'No access token'));
    }
  }

  private request(): Promise<string> {
    const requestId = this.nextRequestId++;
    const refresh = this.stale;
    this.stale = false;
    return new Promise((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject });
      this.post({ type: 'token-request', requestId, refresh });
    });
  }
}

export class UploadHost {
  private readonly runners = new Map<string, UploadRunner>();
  /** Queue order; the scheduler starts queued uploads front to back. */
  private order: string[] = [];
  private maxParallel = 2;
  private readonly tokens: TokenSource;
  private readonly lastSent = new Map<string, { at: number; status: string }>();
  private readonly trailing = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly scope: WorkerScope,
    private readonly deps: HostDeps = defaultHostDeps(),
  ) {
    this.tokens = new TokenSource((message) => scope.postMessage(message));
    scope.addEventListener('message', (event) => this.handle(event.data));
  }

  handle(message: ToWorker): void {
    switch (message.type) {
      case 'configure':
        this.maxParallel = Math.max(1, message.maxParallelUploads);
        this.deps.configureApi({ baseUrl: message.storageUrl, getAccessToken: () => this.tokens.get() });
        this.pump();
        return;
      case 'add':
        this.add(message.id, message.file, message.uploadToken);
        return;
      case 'pause':
        this.runners.get(message.id)?.pause();
        return;
      case 'resume':
        this.runners.get(message.id)?.resume();
        return;
      case 'cancel':
        void this.runners.get(message.id)?.cancel();
        return;
      case 'retry':
        this.runners.get(message.id)?.retry(message.uploadToken);
        return;
      case 'remove':
        void this.remove(message.id);
        return;
      case 'reorder':
        this.reorder(message.id, message.index);
        return;
      case 'pause-all':
        for (const runner of this.runners.values()) runner.pause();
        return;
      case 'resume-all':
        for (const runner of this.runners.values()) runner.resume();
        return;
      case 'cancel-all':
        for (const runner of this.runners.values()) void runner.cancel();
        return;
      case 'token':
        this.tokens.receive(message);
        return;
    }
  }

  private add(id: string, file: File, uploadToken: string): void {
    if (this.runners.has(id)) return;
    const runner = new UploadRunner(
      id,
      file,
      uploadToken,
      { ...this.deps, invalidateToken: () => this.tokens.invalidate() },
      (changed) => this.changed(changed),
    );
    this.runners.set(id, runner);
    this.order.push(id);
    this.send(runner, true);
    this.pump();
  }

  private async remove(id: string): Promise<void> {
    const runner = this.runners.get(id);
    if (!runner) return;
    await runner.cancel();
    runner.dispose();
    this.runners.delete(id);
    this.order = this.order.filter((other) => other !== id);
    clearTimeout(this.trailing.get(id));
    this.trailing.delete(id);
    this.lastSent.delete(id);
    this.scope.postMessage({ type: 'removed', id });
  }

  private reorder(id: string, index: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) return;
    this.order.splice(from, 1);
    this.order.splice(Math.max(0, Math.min(index, this.order.length)), 0, id);
    this.pump();
  }

  /** Starts queued uploads, front to back, while slots are free. */
  private pump(): void {
    let working = 0;
    for (const runner of this.runners.values()) if (runner.isWorking) working++;

    for (const id of this.order) {
      if (working >= this.maxParallel) return;
      const runner = this.runners.get(id);
      if (runner?.status === 'queued') {
        runner.start();
        working++;
      }
    }
  }

  private changed(runner: UploadRunner): void {
    this.send(runner, false);
    // A slot may have been freed (or taken); queueing does not pump by itself
    queueMicrotask(() => this.pump());
  }

  private send(runner: UploadRunner, force: boolean): void {
    const { id, status } = runner;
    const last = this.lastSent.get(id);
    const now = Date.now();
    const progressOnly = !force && last?.status === status;

    if (progressOnly && now - last.at < PROGRESS_INTERVAL_MS) {
      // Coalesce: the latest snapshot goes out when the interval is over
      if (!this.trailing.has(id)) {
        this.trailing.set(
          id,
          setTimeout(() => {
            this.trailing.delete(id);
            if (this.runners.get(id) === runner) this.send(runner, true);
          }, PROGRESS_INTERVAL_MS - (now - last.at)),
        );
      }
      return;
    }

    clearTimeout(this.trailing.get(id));
    this.trailing.delete(id);
    this.lastSent.set(id, { at: now, status });
    this.scope.postMessage({ type: 'snapshot', upload: runner.snapshot });
  }
}
