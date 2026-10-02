# @task-manager-v2/uploader

Uploads files to storage-service from a Web Worker: BLAKE3 hashing in Wasm, deduplication,
chunked uploads in parallel, pause/resume, cancel, retries.

```ts
import { createUploader } from '@task-manager-v2/uploader';

const uploader = createUploader({
  storageUrl: 'https://storage.example.com',
  getAccessToken: ({ forceRefresh }) => auth.getAccessToken({ forceRefresh }),
});

const upload = uploader.upload(file, { uploadToken });
upload.pause();
upload.resume();
const { asset } = await upload.finished();

// React
const uploads = useSyncExternalStore(uploader.subscribe, uploader.getSnapshot);
```

## How an upload goes

`queued → hashing → initializing → uploading → completing → done`. When storage already has the
content, `initializing` leads to `verifying` instead: only a few sampled ranges are sent to prove
possession. Small files go in one request and skip `completing`.

Any working step can be paused (`paused`, continues with the same step) or cancelled
(`cancelling → cancelled`, the server drops the transaction). Network failures, 5xx and the
server's "too many chunks in flight" are retried for about a minute; after that the upload is
`failed` and `retry()` continues it. A rejected access token is renewed once per request.

- `src/machine` — the state machine, a pure `transition(state, event)`
- `src/worker` — runs the steps (`UploadRunner`) and the queue (`UploadHost`)
- `src/client` — the page side (`Uploader`)
- `src/hasher/wasm` — built from `packages/rust/blake3_wasm`; do not edit

## The Wasm hasher

The module is committed, so building the frontend needs no Rust. After changing
`packages/rust/blake3_wasm`, rebuild it (needs `wasm-pack`; the target comes with
`rust-toolchain.toml`):

```bash
pnpm nx run blake3-wasm:build-wasm
```

`pnpm nx run blake3-wasm:check-wasm` fails when the committed module is out of date.

## Apps using it

Workers are bundled separately, so the app's Vite config needs the path aliases there too:

```ts
worker: { format: 'es', plugins: () => [nxViteTsPaths()] },
```
