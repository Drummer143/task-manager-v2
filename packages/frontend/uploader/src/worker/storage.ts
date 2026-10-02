import {
  uploadCancel,
  uploadChunk,
  uploadComplete,
  uploadInit,
  uploadStatus,
  uploadVerify,
  uploadWholeFile,
} from '@task-manager-v2/api/storage';
import type { UploadSuccessResponse } from '@task-manager-v2/api/storage/schemas';

import type { UploadResult } from '../types';

/** The upload endpoints the runner uses; the generated client by default, a fake in tests. */
export interface StorageApi {
  uploadInit: typeof uploadInit;
  uploadStatus: typeof uploadStatus;
  uploadWholeFile: typeof uploadWholeFile;
  uploadChunk: typeof uploadChunk;
  uploadVerify: typeof uploadVerify;
  uploadComplete: typeof uploadComplete;
  uploadCancel: typeof uploadCancel;
}

export const generatedStorageApi: StorageApi = {
  uploadInit,
  uploadStatus,
  uploadWholeFile,
  uploadChunk,
  uploadVerify,
  uploadComplete,
  uploadCancel,
};

/** storage answers snake_case here; the uploader's own types are camelCase. */
export const toUploadResult = (response: UploadSuccessResponse): UploadResult => ({
  asset: {
    id: response.asset.id,
    name: response.asset.name,
    createdAt: response.asset.created_at,
  },
  mimeType: response.mime_type,
});
