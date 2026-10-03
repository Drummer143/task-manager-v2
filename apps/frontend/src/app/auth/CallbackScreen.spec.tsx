import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { ErrorResponse, type User } from 'oidc-client-ts';

import { type CallbackDeps, CallbackScreen, ME_RETRY_DELAYS_MS, TIMEOUT_MS } from './CallbackScreen';
import { MeError } from './me';

const user = (overrides: Partial<User> = {}) =>
  ({
    access_token: 'access',
    id_token: 'id-token',
    expired: false,
    state: { returnTo: '/w/product/p/board?view=table' },
    profile: { sub: 'u1', email: 'alex@client.co' },
    ...overrides,
  }) as unknown as User;

const me = { user: { id: 'u1', username: 'alex', picture: null, isActive: true }, workspaces: [], pendingInvites: [] };

function deps(overrides: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    completeSignIn: vi.fn().mockResolvedValue(user()),
    getUser: vi.fn().mockResolvedValue(null),
    removeUser: vi.fn().mockResolvedValue(undefined),
    fetchMe: vi.fn().mockResolvedValue(me),
    startSignIn: vi.fn().mockResolvedValue(undefined),
    switchAccount: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn(),
    isOnline: () => true,
    ...overrides,
  };
}

/** Lets pending promises and timers up to `ms` run. */
const advance = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

function open(d: CallbackDeps, query = '?code=abc&state=xyz') {
  window.history.replaceState(null, '', `/auth/callback${query}`);
  return render(<CallbackScreen deps={d} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CallbackScreen', () => {
  it('exchanges the code, asks /me and goes where sign-in started', async () => {
    const d = deps();
    open(d);

    // The code is out of the address bar before anything else
    expect(window.location.search).toBe('');
    await advance(1_000);

    expect(d.completeSignIn).toHaveBeenCalledWith(expect.stringContaining('/auth/callback?code=abc&state=xyz'));
    expect(d.fetchMe).toHaveBeenCalledWith('access', expect.stringMatching(/^[0-9a-f]{8}$/), expect.any(AbortSignal));
    expect(d.leave).toHaveBeenCalledWith('/w/product/p/board?view=table');
  });

  it('shows nothing for 200 ms, then the spinner, the hint at 1 s and "Start over" at 4 s', async () => {
    const d = deps({ completeSignIn: vi.fn(() => new Promise<User>(() => undefined)) });
    const { container } = open(d);

    expect(container.textContent).toBe('');
    await advance(250);
    expect(screen.queryByText('Verso')).not.toBeNull();
    expect(screen.queryByText('Signing you in…')).toBeNull();

    await advance(1_000);
    expect(screen.queryByText('Signing you in…')).not.toBeNull();
    expect(document.title).toBe('Signing in… · Verso');

    await advance(3_000);
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(d.startSignIn).toHaveBeenCalledTimes(1);
  });

  it('gives up after 15 s', async () => {
    open(deps({ completeSignIn: vi.fn(() => new Promise<User>(() => undefined)) }));

    await advance(TIMEOUT_MS);

    expect(screen.getByRole('heading').textContent).toBe('We couldn’t sign you in');
    expect(screen.queryByText('auth.timeout')).not.toBeNull();
    expect(document.title).toBe('Sign-in problem · Verso');
  });

  it('says a declined sign-in was cancelled, without details, and Enter tries again', async () => {
    const d = deps({ completeSignIn: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'access_denied' })) });
    open(d, '?error=access_denied&state=xyz');
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('Sign-in cancelled');
    expect(document.activeElement).toBe(screen.getByRole('heading'));
    expect(screen.queryByText('Copy details')).toBeNull();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(d.startSignIn).toHaveBeenCalledTimes(1);
  });

  it('quietly starts over once when the sign-in transaction is gone, then explains', async () => {
    const lost = () => vi.fn().mockRejectedValue(new Error('No matching state found in storage'));
    const first = deps({ completeSignIn: lost() });
    open(first);
    await advance();

    expect(first.startSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading')).toBeNull();

    // Back within five minutes: no second quiet attempt
    const second = deps({ completeSignIn: lost() });
    open(second);
    await advance();

    expect(second.startSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('heading').textContent).toBe('This sign-in has expired');
    expect(screen.queryByText('auth.state_mismatch')).not.toBeNull();
  });

  it('just goes on when an old callback arrives while signed in', async () => {
    const d = deps({
      completeSignIn: vi.fn().mockRejectedValue(new Error('No matching state found in storage')),
      getUser: vi.fn().mockResolvedValue(user()),
    });
    sessionStorage.setItem('verso.auth.returnTo', '/w/product/p/mobile');
    open(d);
    await advance();

    expect(d.leave).toHaveBeenCalledWith('/w/product/p/mobile');
  });

  it('refuses an account /me does not let in and offers another one', async () => {
    const d = deps({ fetchMe: vi.fn().mockRejectedValue(new MeError(403, 'r')) });
    open(d);
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('Your account can’t use this Verso');
    expect(screen.getByText('alex@client.co').tagName).toBe('B');
    expect(d.removeUser).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Use another account/ }));
    expect(d.switchAccount).toHaveBeenCalledWith('id-token');
  });

  it('retries /me on server errors before explaining, and Retry asks /me only', async () => {
    const fetchMe = vi.fn().mockRejectedValue(new MeError(502, 'r'));
    const d = deps({ fetchMe });
    open(d);
    await advance();

    for (const delay of ME_RETRY_DELAYS_MS) await advance(delay);
    expect(fetchMe).toHaveBeenCalledTimes(1 + ME_RETRY_DELAYS_MS.length);
    expect(screen.getByRole('heading').textContent).toBe('We couldn’t reach Verso');
    expect(d.removeUser).not.toHaveBeenCalled();

    fetchMe.mockResolvedValue(me);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await advance(1_000);

    expect(d.completeSignIn).toHaveBeenCalledTimes(1);
    expect(d.leave).toHaveBeenCalled();
  });

  it('waits for the network instead of failing', async () => {
    let online = false;
    const d = deps({ isOnline: () => online });
    open(d);
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('You’re offline');
    expect(screen.queryByText('Waiting for connection…')).not.toBeNull();
    expect(d.completeSignIn).not.toHaveBeenCalled();

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await advance(1_000);

    expect(d.leave).toHaveBeenCalledWith('/w/product/p/board?view=table');
  });

  it('waits for the network when the exchange fails offline, then exchanges the same code', async () => {
    let online = false;
    const completeSignIn = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(user());
    const d = deps({ completeSignIn, isOnline: () => online });
    // Online when the page opened, offline when the exchange went out
    online = true;
    open(d);
    online = false;
    await advance();
    expect(screen.getByRole('heading').textContent).toBe('You’re offline');

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await advance(1_000);

    expect(completeSignIn).toHaveBeenCalledTimes(2);
    expect(d.leave).toHaveBeenCalled();
  });

  it('starts a new sign-in when the network came back after the code expired', async () => {
    const d = deps({ isOnline: () => false });
    open(d);
    await advance(61_000);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await advance();

    expect(d.startSignIn).toHaveBeenCalledTimes(1);
    expect(d.completeSignIn).not.toHaveBeenCalled();
  });

  it('waits for the network when /me fails offline', async () => {
    let online = true;
    const fetchMe = vi.fn().mockImplementationOnce(async () => {
      online = false;
      throw new MeError(undefined, 'r');
    });
    fetchMe.mockResolvedValue(me);
    const d = deps({ fetchMe, isOnline: () => online });
    open(d);
    await advance();
    expect(screen.getByRole('heading').textContent).toBe('You’re offline');

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await advance(1_000);

    expect(fetchMe).toHaveBeenCalledTimes(2);
    expect(d.leave).toHaveBeenCalled();
  });

  it('drops the session when /me refuses the token', async () => {
    const d = deps({ fetchMe: vi.fn().mockRejectedValue(new MeError(401, 'r')) });
    open(d);
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('We couldn’t sign you in');
    expect(d.removeUser).toHaveBeenCalled();
  });

  it('names no one when the refused account has no email', async () => {
    open(
      deps({
        completeSignIn: vi.fn().mockResolvedValue(user({ profile: { sub: 'u1' } } as Partial<User>)),
        fetchMe: vi.fn().mockRejectedValue(new MeError(403, 'r')),
      }),
    );
    await advance();

    expect(screen.getByText(/This account isn’t allowed/)).not.toBeNull();
  });

  it('treats a page without authentik’s answer like a lost sign-in', async () => {
    const d = deps();
    open(d, '');
    await advance();

    expect(d.completeSignIn).not.toHaveBeenCalled();
    expect(d.startSignIn).toHaveBeenCalledTimes(1);
  });

  it('ignores an exchange that finishes after "Start over"', async () => {
    let finish: (u: User) => void = () => undefined;
    const d = deps({ completeSignIn: vi.fn(() => new Promise<User>((resolve) => (finish = resolve))) });
    open(d);
    await advance(4_100);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    finish(user());
    await advance(1_000);

    expect(d.startSignIn).toHaveBeenCalledTimes(1);
    expect(d.fetchMe).not.toHaveBeenCalled();
    expect(d.leave).not.toHaveBeenCalled();
  });

  it('exchanges the code once under StrictMode', async () => {
    const d = deps();
    window.history.replaceState(null, '', '/auth/callback?code=abc&state=xyz');
    render(
      <StrictMode>
        <CallbackScreen deps={d} />
      </StrictMode>,
    );
    await advance(1_000);

    expect(d.completeSignIn).toHaveBeenCalledTimes(1);
  });

  it('keeps a spinner that appeared on screen for its minimum time', async () => {
    const d = deps({ completeSignIn: vi.fn(() => new Promise<User>((resolve) => setTimeout(() => resolve(user()), 300))) });
    open(d);

    await advance(350);
    expect(d.leave).not.toHaveBeenCalled();

    await advance(300);
    expect(d.leave).toHaveBeenCalled();
  });

  describe('after "Start over", the abandoned attempt has no say', () => {
    /** Opens with `fetchMe`, waits for "Start over" and clicks it. */
    async function startOverWhileWaiting(d: CallbackDeps) {
      open(d);
      await advance(4_100);
      fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    }

    it('an exchange that fails late', async () => {
      let fail: (e: unknown) => void = () => undefined;
      const d = deps({ completeSignIn: vi.fn(() => new Promise<User>((_, reject) => (fail = reject))) });
      await startOverWhileWaiting(d);

      fail(new ErrorResponse({ error: 'server_error' }));
      await advance();

      expect(screen.queryByRole('heading')).toBeNull();
    });

    it('a /me that answers late', async () => {
      let answer: (value: typeof me) => void = () => undefined;
      const d = deps({ fetchMe: vi.fn(() => new Promise<typeof me>((resolve) => (answer = resolve))) });
      await startOverWhileWaiting(d);

      answer(me);
      await advance(1_000);

      expect(d.leave).not.toHaveBeenCalled();
    });

    it('a /me that fails late', async () => {
      let fail: (e: unknown) => void = () => undefined;
      const d = deps({ fetchMe: vi.fn(() => new Promise<typeof me>((_, reject) => (fail = reject))) });
      await startOverWhileWaiting(d);

      fail(new MeError(403, 'r'));
      await advance();

      expect(screen.queryByRole('heading')).toBeNull();
      expect(d.removeUser).not.toHaveBeenCalled();
    });

    it('/me retries still pending', async () => {
      const fetchMe = vi.fn().mockRejectedValue(new MeError(502, 'r'));
      const d = deps({ fetchMe });
      // First retry after 2 s, the second after 4 s more: "Start over" shows up in between
      await startOverWhileWaiting(d);
      const calls = fetchMe.mock.calls.length;

      await advance(20_000);

      expect(fetchMe).toHaveBeenCalledTimes(calls);
      expect(screen.queryByRole('heading')).toBeNull();
    });
  });

  it('explains when leaving for authentik fails instead of staying blank', async () => {
    const d = deps({
      completeSignIn: vi.fn().mockRejectedValue(new Error('No matching state found in storage')),
      startSignIn: vi.fn().mockRejectedValue(new Error('No authority or metadataUrl configured on settings')),
    });
    open(d);
    await advance();

    expect(d.startSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading').textContent).toBe('Sign-in isn’t set up correctly');
  });

  it('explains when signing out for another account fails', async () => {
    const d = deps({
      fetchMe: vi.fn().mockRejectedValue(new MeError(403, 'r')),
      switchAccount: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    open(d);
    await advance();

    fireEvent.click(screen.getByRole('button', { name: /Use another account/ }));
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('Sign-in isn’t set up correctly');
  });

  it('reads a CORS refusal while online as a setup problem', async () => {
    open(deps({ completeSignIn: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) }));
    await advance();

    expect(screen.getByRole('heading').textContent).toBe('Sign-in isn’t set up correctly');
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('copies the details without the query string', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open(deps({ completeSignIn: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'server_error' })) }));
    await advance();

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await advance();

    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('auth.idp_error');
    expect(text).toMatch(/req [0-9a-f]{8}/);
    expect(text).toContain(`${window.location.origin}/auth/callback`);
    expect(text).not.toContain('code=');
    expect(screen.queryByText('Copied')).not.toBeNull();
  });
});
