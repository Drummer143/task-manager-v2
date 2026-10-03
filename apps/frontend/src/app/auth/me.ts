/**
 * `GET /me` of main-service: the step after authentik that decides whether this person may use
 * the app (and creates them on their first sign-in). The call itself is the generated contract
 * client (`@task-manager-v2/api/main`), pointed at main-service by `configureMain` in main.tsx.
 */

import { getMe } from '@task-manager-v2/api/main';
import type { MeResponse } from '@task-manager-v2/api/main/schemas';
import { isAxiosError } from 'axios';

export type { MeResponse };

/** A `/me` call that did not end in 200. `status` is undefined when no response arrived. */
export class MeError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly requestId: string,
  ) {
    super(status === undefined ? 'GET /me got no response' : `GET /me answered ${status}`);
    this.name = 'MeError';
  }
}

/**
 * The token goes explicitly: the callback has it before anything else may. `requestId` goes
 * along as `X-Request-Id`, so the id shown next to an error is the one in the server's logs.
 */
export async function fetchMe(accessToken: string, requestId: string, signal?: AbortSignal): Promise<MeResponse> {
  try {
    return await getMe({
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
      signal,
    });
  } catch (error) {
    // An abort or a timeout of the caller's signal is the caller's to read
    if (signal?.aborted) throw error;
    if (!isAxiosError(error)) throw error;
    throw new MeError(error.response?.status, requestId);
  }
}
