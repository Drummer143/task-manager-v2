import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthContextProps } from 'react-oidc-context';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { initialsOf } from '@task-manager-v2/ui-kit';

import { AccountMenu } from './AccountMenu';
import { LoginScreen } from './LoginScreen';
import { RequireAuth } from './RequireAuth';
import * as session from './user-manager';

const auth = vi.hoisted(() => ({ current: {} as Partial<AuthContextProps> }));
vi.mock('react-oidc-context', () => ({ useAuth: () => auth.current }));

const signedOut = (): Partial<AuthContextProps> => ({
  isLoading: false,
  isAuthenticated: false,
  user: null,
  signoutRedirect: vi.fn().mockResolvedValue(undefined),
});

const signedIn = (): Partial<AuthContextProps> => ({
  ...signedOut(),
  isAuthenticated: true,
  user: { profile: { sub: 'user-1', name: 'Ada Lovelace' } } as AuthContextProps['user'],
});

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginScreen /> },
      { element: <RequireAuth />, children: [{ path: '/w/:workspace/p/:page', element: <p>workspace page</p> }] },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('RequireAuth', () => {
  it('sends a signed-out visitor to /login, remembering the page', async () => {
    auth.current = signedOut();
    vi.spyOn(session, 'startSignIn').mockResolvedValue(undefined);
    vi.spyOn(session.userManager, 'getUser').mockResolvedValue(null);

    const router = renderAt('/w/product/p/board?view=table');

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?return_to=${encodeURIComponent('/w/product/p/board?view=table')}`);
    await waitFor(() =>
      expect(session.startSignIn).toHaveBeenCalledWith('/w/product/p/board?view=table', { selectAccount: false }),
    );
  });

  it('shows only the background while the session is restored', () => {
    auth.current = { ...signedOut(), isLoading: true };

    const router = renderAt('/w/product/p/board');

    expect(router.state.location.pathname).toBe('/w/product/p/board');
    expect(screen.queryByText('workspace page')).toBeNull();
  });

  it('shows the page to a signed-in user', () => {
    auth.current = signedIn();

    renderAt('/w/product/p/board');

    expect(screen.queryByText('workspace page')).not.toBeNull();
  });
});

describe('LoginScreen', () => {
  beforeEach(() => {
    auth.current = signedIn();
  });

  it('goes straight back when already signed in', async () => {
    vi.spyOn(session.userManager, 'getUser').mockResolvedValue({ expired: false } as never);
    const startSignIn = vi.spyOn(session, 'startSignIn');

    const router = renderAt('/login?return_to=%2Fw%2Fproduct%2Fp%2Fmobile');

    await waitFor(() => expect(router.state.location.pathname).toBe('/w/product/p/mobile'));
    expect(startSignIn).not.toHaveBeenCalled();
  });

  it('asks for another account after "Use another account"', async () => {
    sessionStorage.setItem('verso.auth.selectAccount', '1');
    vi.spyOn(session, 'startSignIn').mockResolvedValue(undefined);

    renderAt('/login?return_to=https%3A%2F%2Fevil.test');

    await waitFor(() => expect(session.startSignIn).toHaveBeenCalledWith('/', { selectAccount: true }));
    expect(sessionStorage.getItem('verso.auth.selectAccount')).toBeNull();
  });

  it('explains when authentik cannot be reached', async () => {
    vi.spyOn(session.userManager, 'getUser').mockResolvedValue(null);
    vi.spyOn(session, 'startSignIn').mockRejectedValue(new Error('Failed to load metadata'));

    renderAt('/login');

    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('We couldn’t sign you in'));
  });
});

describe('AccountMenu', () => {
  it('shows the user and signs out', () => {
    auth.current = signedIn();

    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.queryByText(initialsOf('Ada Lovelace', 'sm'))).not.toBeNull();
    expect(auth.current.signoutRedirect).toHaveBeenCalledTimes(1);
  });

  it('falls back from the full name to the username, then the email', () => {
    for (const [profile, shown] of [
      [{ sub: 'u', preferred_username: 'ada' }, 'ada'],
      [{ sub: 'u', email: 'grace@example.test' }, 'grace@example.test'],
      [{ sub: 'u' }, 'Account'],
    ] as const) {
      auth.current = { ...signedIn(), user: { profile } as AuthContextProps['user'] };
      const { unmount } = render(<AccountMenu />);
      expect(screen.queryByText(initialsOf(shown, 'sm'))).not.toBeNull();
      unmount();
    }
  });

  it('renders nothing when signed out', () => {
    auth.current = signedOut();

    const { container } = render(<AccountMenu />);

    expect(container.innerHTML).toBe('');
  });
});
