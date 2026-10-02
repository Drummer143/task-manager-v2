import type { WorkerScope } from './messages';
import { UploadHost } from './upload-host';

// The worker global; typed narrowly because the lib compiles against the DOM, not WebWorker, types
new UploadHost(self as unknown as WorkerScope);
