import init, { Blake3Hasher, type InitInput } from './wasm/blake3';

export interface Hasher {
  update(data: Uint8Array): void;
  /** Lowercase hex, the format storage compares against. */
  finalize(): string;
  /** Releases the Wasm memory; the hasher is unusable afterwards. */
  free(): void;
}

let ready: Promise<unknown> | undefined;

/**
 * Loads the module once. Without `input` it is fetched next to the bundle (the bundler resolves
 * `blake3_bg.wasm`); tests pass the bytes instead.
 */
export const loadBlake3 = (input?: InitInput): Promise<unknown> =>
  (ready ??= init(input === undefined ? undefined : { module_or_path: input }).catch((error: unknown) => {
    // Let a later call try again instead of caching the failure
    ready = undefined;
    throw error;
  }));

/** A fresh incremental hasher; {@link loadBlake3} must have resolved. */
export const createBlake3Hasher = (): Hasher => new Blake3Hasher();
