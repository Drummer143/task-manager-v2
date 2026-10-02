/* tslint:disable */
/* eslint-disable */

export class Blake3Hasher {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The hash of everything fed so far, as lowercase hex. The hasher can keep going afterwards.
     */
    finalize(): string;
    constructor();
    reset(): void;
    /**
     * Feeds the next bytes. A `Uint8Array` on the JS side; it is copied into Wasm memory.
     */
    update(data: Uint8Array): void;
    /**
     * Bytes fed so far.
     */
    readonly bytesHashed: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_blake3hasher_free: (a: number, b: number) => void;
    readonly blake3hasher_bytesHashed: (a: number) => number;
    readonly blake3hasher_finalize: (a: number, b: number) => void;
    readonly blake3hasher_new: () => number;
    readonly blake3hasher_reset: (a: number) => void;
    readonly blake3hasher_update: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
