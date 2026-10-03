import { getMe } from '@task-manager-v2/api/main';
import { AxiosError, type AxiosResponse } from 'axios';

import { MeError, fetchMe } from './me';

vi.mock('@task-manager-v2/api/main', () => ({ getMe: vi.fn() }));

const me = { user: { id: 'u1' }, workspaces: [], pendingInvites: [] } as unknown as Awaited<ReturnType<typeof getMe>>;

const answered = (status: number) =>
  new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
  } as AxiosResponse);

afterEach(() => {
  vi.mocked(getMe).mockReset();
});

describe('fetchMe', () => {
  it('calls the contract with the token, the request id and the signal', async () => {
    vi.mocked(getMe).mockResolvedValue(me);
    const signal = new AbortController().signal;

    await expect(fetchMe('access', 'req1', signal)).resolves.toBe(me);
    expect(getMe).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer access', 'X-Request-Id': 'req1' },
      signal,
    });
  });

  it('reports the status of a refusal', async () => {
    vi.mocked(getMe).mockRejectedValue(answered(403));

    await expect(fetchMe('access', 'req1')).rejects.toMatchObject({ status: 403, requestId: 'req1' });
  });

  it('reports a missing response without a status', async () => {
    vi.mocked(getMe).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));

    const error = await fetchMe('access', 'req1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MeError);
    expect((error as MeError).status).toBeUndefined();
  });

  it('lets an abort or a timeout of the signal through as it is', async () => {
    const controller = new AbortController();
    controller.abort();
    const canceled = new AxiosError('canceled', 'ERR_CANCELED');
    vi.mocked(getMe).mockRejectedValue(canceled);

    await expect(fetchMe('access', 'req1', controller.signal)).rejects.toBe(canceled);
  });

  it('does not hide a bug as a failed request', async () => {
    const bug = new TypeError('x is not a function');
    vi.mocked(getMe).mockRejectedValue(bug);

    await expect(fetchMe('access', 'req1')).rejects.toBe(bug);
  });
});
