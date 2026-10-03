/**
 * `GET /me` of main-service: the step after authentik that decides whether this person may use
 * the app (and creates them on their first sign-in).
 */

export interface MeUser {
  id: string;
  username: string;
  email?: string;
  picture: string | null;
  isActive: boolean;
}

export interface MeResponse {
  user: MeUser;
  workspaces: unknown[];
  pendingInvites: unknown[];
}

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

const apiUrl = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/**
 * `requestId` goes along as `X-Request-Id`, so the id shown next to an error is the one in the
 * server's logs.
 */
export async function fetchMe(accessToken: string, requestId: string, signal?: AbortSignal): Promise<MeResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MeError(undefined, requestId);
  }
  if (!response.ok) throw new MeError(response.status, requestId);
  return (await response.json()) as MeResponse;
}
