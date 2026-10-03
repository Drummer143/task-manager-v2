import { MeError, fetchMe } from './me';

const me = { user: { id: 'u1' }, workspaces: [], pendingInvites: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fetchMe', () => {
  it('calls main-service with the token and the request id', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(me), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchMe('access', 'req1')).resolves.toEqual(me);
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/me', {
      headers: { Authorization: 'Bearer access', 'X-Request-Id': 'req1' },
      signal: undefined,
    });
  });

  it('reports the status of a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));

    await expect(fetchMe('access', 'req1')).rejects.toMatchObject({ status: 403, requestId: 'req1' });
  });

  it('reports a missing response without a status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await fetchMe('access', 'req1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MeError);
    expect((error as MeError).status).toBeUndefined();
  });

  it('lets an abort through as it is', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    await expect(fetchMe('access', 'req1', controller.signal)).rejects.toBe(abort);
  });
});
