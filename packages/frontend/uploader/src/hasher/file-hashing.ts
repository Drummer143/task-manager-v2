import { abortError } from '../errors';
import type { Hasher } from './blake3';

/** Bytes read per step: large enough to keep Wasm busy, small enough to stop promptly on pause. */
export const HASH_SLICE_BYTES = 4 * 1024 * 1024;

/**
 * Hashes a file slice by slice and can stop at any slice boundary: the hasher and the offset
 * survive, so a paused upload continues hashing where it stopped instead of starting over.
 */
export class FileHashing {
  private hasher: Hasher | undefined;
  private offset = 0;

  constructor(
    private readonly file: Blob,
    private readonly createHasher: () => Hasher,
    private readonly sliceBytes = HASH_SLICE_BYTES,
  ) {}

  get hashedBytes(): number {
    return this.offset;
  }

  /**
   * Hashes the rest of the file. Rejects with an `AbortError` once `signal` aborts (after the slice
   * in progress, which still counts); calling `run` again continues from there.
   */
  async run(signal: AbortSignal, onProgress: (hashedBytes: number) => void): Promise<string> {
    this.hasher ??= this.createHasher();
    const hasher = this.hasher;

    while (this.offset < this.file.size) {
      if (signal.aborted) throw abortError();

      const end = Math.min(this.offset + this.sliceBytes, this.file.size);
      const bytes = new Uint8Array(await this.file.slice(this.offset, end).arrayBuffer());
      hasher.update(bytes);
      this.offset = end;
      onProgress(this.offset);
    }

    const hash = hasher.finalize();
    this.dispose();
    return hash;
  }

  /** Frees the hasher; the next `run` starts from the beginning. */
  dispose(): void {
    this.hasher?.free();
    this.hasher = undefined;
    this.offset = 0;
  }
}
